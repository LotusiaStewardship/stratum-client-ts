import { Socket } from 'node:net'
import type { StratumTransport } from './types.js'

/**
 * Node.js TCP transport for direct Stratum v1 connections.
 *
 * This transport talks to lotusd's native Stratum listener directly over TCP
 * (`-stratumport`, default 3334) using newline-delimited JSON payloads.
 *
 * Runtime scope:
 * - Supported: Node.js
 * - Not supported: browsers
 */
export class NodeTcpStratumTransport implements StratumTransport {
  private socket: Socket | null = null
  private dataHandler: (data: string) => void = () => {}
  private errorHandler: (error: unknown) => void = () => {}
  private closeHandler: () => void = () => {}

  /**
   * @param host - Remote Stratum host.
   * @param port - Remote Stratum TCP port.
   */
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  /**
   * Open TCP connection and attach socket callbacks.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket()
      this.socket = socket

      const onErrorBeforeConnect = (error: Error): void => {
        this.errorHandler(error)
        socket.removeListener('connect', onConnect)
        reject(error)
      }

      const onConnect = (): void => {
        socket.removeListener('error', onErrorBeforeConnect)

        socket.on('data', chunk => this.dataHandler(chunk.toString('utf8')))
        socket.on('error', error => this.errorHandler(error))
        socket.on('close', () => this.closeHandler())

        resolve()
      }

      socket.once('error', onErrorBeforeConnect)
      socket.once('connect', onConnect)
      socket.connect(this.port, this.host)
    })
  }

  /**
   * Send a serialized Stratum frame over TCP.
   *
   * @throws Error if called before successful connection.
   */
  send(data: string): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Transport not connected')
    }
    this.socket.write(data, 'utf8')
  }

  /**
   * Close and destroy the current socket.
   */
  close(): void {
    this.socket?.end()
    this.socket?.destroy()
    this.socket = null
  }

  /** Register inbound data callback. */
  onData(handler: (data: string) => void): void {
    this.dataHandler = handler
  }

  /** Register socket error callback. */
  onError(handler: (error: unknown) => void): void {
    this.errorHandler = handler
  }

  /** Register socket close callback. */
  onClose(handler: () => void): void {
    this.closeHandler = handler
  }
}
