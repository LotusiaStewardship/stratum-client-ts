import {
  decodeNativeNotify,
  decodeSetExtranonce,
  decodeSubscribeResult,
  encodeNativeSubmit,
  parseStratumLine,
  serializeRequest,
  StratumLineBuffer,
} from '../protocol/codec.js'
import type {
  NativeNotifyParams,
  NativeSubmitParams,
  SetExtranonceParams,
  StratumNotification,
  StratumResponse,
  SubscribeResult,
} from '../protocol/types.js'
import type { StratumTransport } from '../transport/types.js'

/**
 * Callback hooks for client-side integration.
 */
export interface StratumClientEvents {
  /** Fired on each `mining.notify` message. */
  onNotify?: (job: NativeNotifyParams) => void
  /** Fired on each `mining.set_difficulty` update. */
  onSetDifficulty?: (difficulty: number) => void
  /** Fired on each `mining.set_extranonce` notification. */
  onSetExtranonce?: (params: SetExtranonceParams) => void
  /** Fired when the transport closes. */
  onClose?: () => void
  /** Fired on transport-level errors. */
  onError?: (error: unknown) => void
}

/**
 * Configuration options for the Stratum client.
 */
export interface StratumClientOptions {
  /**
   * Request timeout in milliseconds. If a response is not received within
   * this window, the pending request is rejected.
   * @default 30_000
   */
  requestTimeoutMs?: number
}

/**
 * High-level Stratum v1 client focused on Lotus native SHA-256 mining.
 *
 * Responsibilities:
 * - request/response id correlation
 * - newline stream decoding
 * - typed helpers for core mining methods
 * - notification dispatching
 */
export class StratumClient {
  /** Incremental line parser for chunked inbound data. */
  private readonly lines = new StratumLineBuffer()
  /** Monotonic request id counter. */
  private nextId = 1
  /** Pending request state keyed by request id. */
  private readonly pending = new Map<
    number,
    {
      resolve: (response: StratumResponse) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  /** Current extranonce1 from subscribe response or set_extranonce notification. */
  private extranonce1: string | null = null
  /** Current extranonce2 size from subscribe response or set_extranonce notification. */
  private extranonce2Size: number | null = null
  /** Active job ids from mining.notify notifications. Cleared on cleanJobs=true. */
  private readonly activeJobs = new Set<string>()
  /** Request timeout in milliseconds. */
  private readonly requestTimeoutMs: number

  /**
   * @param transport - Concrete transport implementation.
   * @param events - Optional callback hooks.
   * @param options - Optional configuration.
   */
  constructor(
    private readonly transport: StratumTransport,
    private readonly events: StratumClientEvents = {},
    private readonly options: StratumClientOptions = {},
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.transport.onData(chunk => this.onData(chunk))
    this.transport.onError(error => this.events.onError?.(error))
    this.transport.onClose(() => {
      this.rejectAllPending('Transport closed')
      this.events.onClose?.()
    })
  }

  /** Open the transport connection. */
  async connect(): Promise<void> {
    await this.transport.connect()
  }

  /** Close the transport connection. */
  close(): void {
    this.transport.close()
  }

  /**
   * Run Stratum subscribe handshake.
   *
   * @param userAgent - Optional miner client identifier string.
   */
  async subscribe(
    userAgent = 'stratum-client-ts/0.1.0',
  ): Promise<SubscribeResult> {
    const result = await this.request<unknown>('mining.subscribe', [userAgent])
    const decoded = decodeSubscribeResult(result)
    this.extranonce1 = decoded.extranonce1
    this.extranonce2Size = decoded.extranonce2Size
    return decoded
  }

  /**
   * Returns the current extranonce state (from subscribe or set_extranonce).
   */
  getExtranonceState(): {
    extranonce1: string | null
    extranonce2Size: number | null
  } {
    return { extranonce1: this.extranonce1, extranonce2Size: this.extranonce2Size }
  }

  /**
   * Authorize a worker identity.
   */
  async authorize(workerName: string, password = 'x'): Promise<boolean> {
    const result = await this.request<boolean>('mining.authorize', [
      workerName,
      password,
    ])
    return Boolean(result)
  }

  /**
   * Submit a native Lotus share using the 5-parameter submit shape.
   */
  async submitNativeShare(params: NativeSubmitParams): Promise<boolean> {
    const result = await this.request<boolean>(
      'mining.submit',
      encodeNativeSubmit(params),
    )
    return Boolean(result)
  }

  /**
   * Send `mining.ping` to test connectivity.
   */
  async ping(): Promise<unknown> {
    return this.request('mining.ping', [])
  }

  /**
   * Send `mining.suggest_difficulty` to hint the pool about desired difficulty.
   *
   * The server currently returns error 20 ("unsupported") but this method
   * is part of the Stratum v1 protocol and may be enabled in future.
   */
  async suggestDifficulty(difficulty: number): Promise<void> {
    await this.request('mining.suggest_difficulty', [difficulty])
  }

  /**
   * Send `mining.extranonce.subscribe` to opt into extranonce-only mode.
   *
   * Some mining setups use this to disable full job notifications in favor
   * of extranonce rotation only.
   */
  async extranonceSubscribe(): Promise<boolean> {
    return this.request<boolean>('mining.extranonce.subscribe', [])
  }

  /**
   * Send a generic request and await correlated response.
   *
   * @typeParam T - Expected response result payload type.
   */
  private request<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId
    this.nextId += 1
    this.transport.send(serializeRequest(id, method, params))

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request ${id} (${method}) timed out after ${this.requestTimeoutMs}ms`))
      }, this.requestTimeoutMs)

      this.pending.set(id, {
        resolve: response => {
          clearTimeout(timer)
          if (response.error) {
            const [code, message] = response.error
            reject(new Error(`Stratum error ${code}: ${message}`))
            return
          }
          resolve(response.result as T)
        },
        reject,
        timer,
      })
    })
  }

  /** Reject all pending requests with a common reason (e.g. transport close). */
  private rejectAllPending(reason: string): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error(reason))
    }
    this.pending.clear()
  }

  /**
   * Handle raw transport data chunks.
   *
   * The parser supports multiple messages per chunk and partial messages across
   * chunks.
   */
  private onData(chunk: string): void {
    this.lines.append(chunk)
    for (const line of this.lines.extractLines()) {
      const parsed = parseStratumLine(line)
      if (!parsed) continue

      // JSON-RPC notification path (method + no concrete id).
      if ('method' in parsed && !('id' in parsed && parsed.id !== null)) {
        this.handleNotification(parsed)
        continue
      }

      // JSON-RPC response path.
      if ('result' in parsed && typeof parsed.id === 'number') {
        const entry = this.pending.get(parsed.id)
        if (!entry) continue
        this.pending.delete(parsed.id)
        entry.resolve(parsed)
      }
    }
  }

  /**
   * Dispatch server notifications to typed callbacks.
   */
  private handleNotification(notification: StratumNotification): void {
    if (notification.method === 'mining.notify') {
      const job = decodeNativeNotify(notification.params)
      if (job.cleanJobs) {
        this.activeJobs.clear()
      }
      this.activeJobs.add(job.jobId)
      this.events.onNotify?.(job)
      return
    }

    if (notification.method === 'mining.set_difficulty') {
      const diff = (notification.params as [number])[0]
      this.events.onSetDifficulty?.(diff)
      return
    }

    if (notification.method === 'mining.set_extranonce') {
      const params = decodeSetExtranonce(notification.params)
      this.extranonce1 = params.extranonce1
      this.extranonce2Size = params.extranonce2Size
      this.events.onSetExtranonce?.(params)
    }
  }

  /**
   * Returns true if the given jobId is currently active (not stale).
   * Returns false if no mining.notify has been received yet.
   */
  isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId)
  }
}
