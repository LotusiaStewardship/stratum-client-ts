import { StratumClient } from '../lib/client/stratum-client.js'
import type { StratumTransport } from '../lib/transport/types.js'

/**
 * Minimal deterministic transport used for request/response protocol tests.
 */
class FakeTransport implements StratumTransport {
  private onDataHandler: (data: string) => void = () => {}
  private onErrorHandler: (error: unknown) => void = () => {}
  private onCloseHandler: () => void = () => {}
  sent: string[] = []

  async connect(): Promise<void> {}

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.onCloseHandler()
  }

  onData(handler: (data: string) => void): void {
    this.onDataHandler = handler
  }

  onError(handler: (error: unknown) => void): void {
    this.onErrorHandler = handler
  }

  onClose(handler: () => void): void {
    this.onCloseHandler = handler
  }

  /** Push one synthetic inbound Stratum line into the client. */
  push(line: string): void {
    this.onDataHandler(`${line}\n`)
  }
}

describe('StratumClient', () => {
  it('subscribes and authorizes and handles notifications', async () => {
    const transport = new FakeTransport()
    let gotNotify = false
    let gotDiff = false

    const client = new StratumClient(transport, {
      onNotify: () => {
        gotNotify = true
      },
      onSetDifficulty: () => {
        gotDiff = true
      },
    })

    await client.connect()

    const subPromise = client.subscribe()
    transport.push('{"id":1,"result":[[],"01020304",4],"error":null}')
    const sub = await subPromise
    expect(sub.extranonce1).toBe('01020304')

    const authPromise = client.authorize('lotus_addr.worker', 'x')
    // Server may emit async notifications before the auth response.
    transport.push('{"method":"mining.set_difficulty","params":[0.001]}')
    transport.push(
      '{"method":"mining.notify","params":["1","00","aa","bb",[],"11","ffff001d","010203040506","00000000",true]}',
    )
    transport.push('{"id":2,"result":true,"error":null}')

    expect(await authPromise).toBe(true)
    expect(gotNotify).toBe(true)
    expect(gotDiff).toBe(true)

    const submitPromise = client.submitNativeShare({
      workerName: 'lotus_addr.worker',
      jobId: '1',
      extranonce2: '00000000',
      ntime: '010203040506',
      nonce: '0000000000000000',
    })
    transport.push('{"id":3,"result":false,"error":null}')

    expect(await submitPromise).toBe(false)
  })
})
