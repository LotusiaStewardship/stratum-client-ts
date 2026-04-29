import type {
  NativeNotifyParams,
  NativeSubmitParams,
  StratumMessage,
  StratumNotification,
  StratumRequest,
  StratumResponse,
  SubscribeResult,
} from './types.js'

/**
 * Maximum accepted line length for a single Stratum JSON message.
 *
 * This mirrors lotusd's defensive parsing constraints so client-side
 * buffering behaves similarly under malformed or malicious input.
 */
export const MAX_LINE_LENGTH = 16_384

/**
 * Stateful helper for incrementally parsing newline-delimited Stratum frames.
 *
 * Stratum transports may deliver partial frames or multiple frames per chunk.
 * This buffer accumulates data and emits complete lines while keeping strict
 * size limits to avoid unbounded memory growth.
 */
export class StratumLineBuffer {
  private buffer = ''
  private overflow = false

  /**
   * Append raw transport chunk data to the internal buffer.
   *
   * Once overflow is detected, appends are ignored until the instance is
   * recreated. This fail-closed behavior avoids processing potentially
   * corrupted state.
   */
  append(data: string): void {
    if (this.overflow) return
    this.buffer += data
    if (this.buffer.length > MAX_LINE_LENGTH * 2) {
      this.overflow = true
      this.buffer = ''
    }
  }

  /**
   * Extract every complete line currently available.
   *
   * - Handles LF and CRLF endings.
   * - Drops empty lines.
   * - Marks overflow if an individual line exceeds `MAX_LINE_LENGTH`.
   */
  extractLines(): string[] {
    const lines: string[] = []
    let start = 0

    while (true) {
      const end = this.buffer.indexOf('\n', start)
      if (end < 0) break
      let line = this.buffer.slice(start, end)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.length > 0) {
        if (line.length > MAX_LINE_LENGTH) {
          this.overflow = true
          this.buffer = ''
          return lines
        }
        lines.push(line)
      }
      start = end + 1
    }

    if (start > 0) {
      this.buffer = this.buffer.slice(start)
    }
    return lines
  }

  /**
   * Returns whether an overflow condition has been detected.
   */
  overflowDetected(): boolean {
    return this.overflow
  }
}

/**
 * Parse a single JSON Stratum line into a typed message union.
 *
 * @returns Parsed message or `null` when the payload is not a valid Stratum envelope.
 */
export function parseStratumLine(line: string): StratumMessage | null {
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }

  if (!obj || typeof obj !== 'object') return null

  const asRecord = obj as Record<string, unknown>
  const hasMethod = typeof asRecord.method === 'string'
  const hasId = asRecord.id !== undefined && asRecord.id !== null

  if (hasMethod && hasId) {
    return {
      id: parseId(asRecord.id),
      method: asRecord.method as string,
      params: asRecord.params ?? [],
    } as StratumRequest
  }

  if (hasMethod && !hasId) {
    return {
      method: asRecord.method as string,
      params: asRecord.params ?? [],
    } as StratumNotification
  }

  if (
    hasId &&
    (Object.hasOwn(asRecord, 'result') || Object.hasOwn(asRecord, 'error'))
  ) {
    return {
      id: parseId(asRecord.id),
      result: asRecord.result,
      error: (asRecord.error as StratumResponse['error']) ?? null,
    } as StratumResponse
  }

  return null
}

/**
 * Parse JSON-RPC ids accepted by Stratum endpoints.
 *
 * lotusd accepts numeric ids and numeric strings.
 */
function parseId(id: unknown): number {
  if (typeof id === 'number' && Number.isFinite(id)) return id
  if (typeof id === 'string') {
    const parsed = Number.parseInt(id, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error('Invalid Stratum id')
}

/** Serialize a request as a newline-terminated Stratum frame. */
export function serializeRequest(
  id: number,
  method: string,
  params: unknown,
): string {
  return `${JSON.stringify({ id, method, params })}\n`
}

/** Serialize a response as a newline-terminated Stratum frame. */
export function serializeResponse(
  id: number,
  result: unknown,
  error: unknown,
): string {
  return `${JSON.stringify({ id, result, error })}\n`
}

/** Serialize a notification as a newline-terminated Stratum frame. */
export function serializeNotify(method: string, params: unknown): string {
  return `${JSON.stringify({ id: null, method, params })}\n`
}

/**
 * Decode raw `mining.subscribe` result into named fields.
 *
 * Note: this decoder assumes the canonical `[subscriptions, extranonce1,
 * extranonce2Size]` tuple shape.
 */
export function decodeSubscribeResult(payload: unknown): SubscribeResult {
  const arr = payload as [unknown, unknown, unknown]
  return {
    subscriptions: arr[0] as [string, string][],
    extranonce1: arr[1] as string,
    extranonce2Size: arr[2] as number,
  }
}

/**
 * Decode Lotus native `mining.notify` params array into a named object.
 */
export function decodeNativeNotify(params: unknown): NativeNotifyParams {
  const arr = params as unknown[]
  return {
    jobId: String(arr[0]),
    prevHash: String(arr[1]),
    coinbase1: String(arr[2]),
    coinbase2: String(arr[3]),
    merkleBranches: (arr[4] as string[]) ?? [],
    layer3Hash: String(arr[5]),
    nbits: String(arr[6]),
    ntime: String(arr[7]),
    reserved: String(arr[8]),
    cleanJobs: Boolean(arr[9]),
  }
}

/**
 * Encode native share submission fields into the canonical positional array
 * expected by `mining.submit`.
 */
export function encodeNativeSubmit(params: NativeSubmitParams): unknown[] {
  return [
    params.workerName,
    params.jobId,
    params.extranonce2,
    params.ntime,
    params.nonce,
  ]
}
