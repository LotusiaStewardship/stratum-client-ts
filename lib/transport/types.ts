/**
 * Transport abstraction for Stratum newline JSON streams.
 *
 * The core client is transport-agnostic. Browser builds typically use
 * a WebSocket bridge, while server-side consumers may provide custom
 * TCP transports.
 */
export interface StratumTransport {
  /** Open the underlying connection. */
  connect(): Promise<void>
  /** Send a fully-serialized Stratum line payload. */
  send(data: string): void
  /** Close the underlying connection and release resources. */
  close(): void
  /** Register inbound data callback. */
  onData(handler: (data: string) => void): void
  /** Register transport-level error callback. */
  onError(handler: (error: unknown) => void): void
  /** Register close callback. */
  onClose(handler: () => void): void
}
