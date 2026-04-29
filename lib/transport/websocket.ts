import type { StratumTransport } from './types.js'

/**
 * Browser WebSocket transport implementation for Stratum streams.
 *
 * Typical deployment: connect this client to a Stratum-over-WebSocket proxy,
 * since browsers cannot open raw TCP sockets.
 */
export class WebSocketStratumTransport implements StratumTransport {
  private ws: WebSocket | null = null
  private dataHandler: (data: string) => void = () => {}
  private errorHandler: (error: unknown) => void = () => {}
  private closeHandler: () => void = () => {}

  /**
   * @param url - WebSocket endpoint (e.g. `wss://...`).
   */
  constructor(private readonly url: string) {}

  /** Open the WebSocket and wire callbacks into the transport interface. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = event => {
        this.errorHandler(event)
        reject(new Error('WebSocket connection failed'))
      }
      ws.onclose = () => this.closeHandler()
      ws.onmessage = event => this.dataHandler(String(event.data))
    })
  }

  /**
   * Send a newline-terminated Stratum JSON frame.
   *
   * @throws Error when called before connection is open.
   */
  send(data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Transport not connected')
    }
    this.ws.send(data)
  }

  /** Close the socket if open. */
  close(): void {
    this.ws?.close()
    this.ws = null
  }

  /** Register inbound data callback. */
  onData(handler: (data: string) => void): void {
    this.dataHandler = handler
  }

  /** Register transport error callback. */
  onError(handler: (error: unknown) => void): void {
    this.errorHandler = handler
  }

  /** Register close callback. */
  onClose(handler: () => void): void {
    this.closeHandler = handler
  }
}
