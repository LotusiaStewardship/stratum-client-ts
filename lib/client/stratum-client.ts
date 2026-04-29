import {
  decodeNativeNotify,
  decodeSubscribeResult,
  encodeNativeSubmit,
  parseStratumLine,
  serializeRequest,
  StratumLineBuffer,
} from '../protocol/codec.js'
import type {
  NativeNotifyParams,
  NativeSubmitParams,
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
  /** Fired when the transport closes. */
  onClose?: () => void
  /** Fired on transport-level errors. */
  onError?: (error: unknown) => void
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
  /** Pending request resolvers keyed by request id. */
  private readonly pending = new Map<
    number,
    (response: StratumResponse) => void
  >()

  /**
   * @param transport - Concrete transport implementation.
   * @param events - Optional callback hooks.
   */
  constructor(
    private readonly transport: StratumTransport,
    private readonly events: StratumClientEvents = {},
  ) {
    this.transport.onData(chunk => this.onData(chunk))
    this.transport.onError(error => this.events.onError?.(error))
    this.transport.onClose(() => this.events.onClose?.())
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
    return decodeSubscribeResult(result)
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
   * Send a generic request and await correlated response.
   *
   * @typeParam T - Expected response result payload type.
   */
  private request<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId
    this.nextId += 1
    this.transport.send(serializeRequest(id, method, params))

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, response => {
        if (response.error) {
          const [code, message] = response.error
          reject(new Error(`Stratum error ${code}: ${message}`))
          return
        }
        resolve(response.result as T)
      })
    })
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
        const pending = this.pending.get(parsed.id)
        if (!pending) continue
        this.pending.delete(parsed.id)
        pending(parsed)
      }
    }
  }

  /**
   * Dispatch server notifications to typed callbacks.
   */
  private handleNotification(notification: StratumNotification): void {
    if (notification.method === 'mining.notify') {
      this.events.onNotify?.(decodeNativeNotify(notification.params))
      return
    }

    if (notification.method === 'mining.set_difficulty') {
      const diff = (notification.params as [number])[0]
      this.events.onSetDifficulty?.(diff)
    }
  }
}
