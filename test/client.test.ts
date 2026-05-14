import { StratumClient } from '../lib/client/stratum-client.js'
import type { SetExtranonceParams } from '../lib/protocol/types.js'
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
      '{"method":"mining.notify","params":["1","00","aa","bb",[],"20000000","ffff001d","010203040506",true,1000,"epoch_hash_hex","ext_meta_hash",8192]}',
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

  it('handles set_extranonce notification', async () => {
    const transport = new FakeTransport()
    let extranonceParams: SetExtranonceParams | undefined

    const client = new StratumClient(transport, {
      onSetExtranonce: (params) => {
        extranonceParams = params
      },
    })
    await client.connect()

    // Server sends set_extranonce on connect
    transport.push(
      '{"method":"mining.set_extranonce","params":["deadbeef",4]}',
    )

    expect(extranonceParams).toBeDefined()
    expect(extranonceParams!.extranonce1).toBe('deadbeef')
    expect(extranonceParams!.extranonce2Size).toBe(4)
    expect(client.getExtranonceState().extranonce1).toBe('deadbeef')
    expect(client.getExtranonceState().extranonce2Size).toBe(4)
  })

  it('tracks active jobs and clears on cleanJobs', async () => {
    const transport = new FakeTransport()
    const client = new StratumClient(transport)
    await client.connect()

    expect(client.isJobActive('job-1')).toBe(false)

    // Receive notify with cleanJobs=false — job becomes active
    transport.push(
      '{"method":"mining.notify","params":["job-1","00","aa","bb",[],"20000000","ffff001d","010203040506",false,1000,"eh","emh",8192]}',
    )
    expect(client.isJobActive('job-1')).toBe(true)

    // Receive notify with cleanJobs=true — clears old jobs
    transport.push(
      '{"method":"mining.notify","params":["job-2","00","aa","bb",[],"20000000","ffff001d","010203040506",true,1001,"eh","emh",8192]}',
    )
    expect(client.isJobActive('job-1')).toBe(false)
    expect(client.isJobActive('job-2')).toBe(true)
  })

  it('rejects pending requests on transport close', async () => {
    const transport = new FakeTransport()
    const client = new StratumClient(transport)
    await client.connect()

    const pingPromise = client.ping()

    // Close transport — should reject pending
    transport.close()

    await expect(pingPromise).rejects.toThrow('Transport closed')
  })

  it('rejects pending requests on timeout', async () => {
    const transport = new FakeTransport()
    const client = new StratumClient(transport, {}, { requestTimeoutMs: 50 })
    await client.connect()

    const pingPromise = client.ping()

    // Don't push any response — let it timeout
    await expect(pingPromise).rejects.toThrow(
      'Request 1 (mining.ping) timed out after 50ms',
    )
  })

  it('suggestDifficulty sends correct wire format', async () => {
    const transport = new FakeTransport()
    const client = new StratumClient(transport)
    await client.connect()

    // Server returns error 20 (unsupported) — but we verify the sent message
    const promise = client.suggestDifficulty(16.0)
    const sent = transport.sent.find(s => s.includes('suggest_difficulty'))
    expect(sent).toBeDefined()

    const msg = JSON.parse(sent!.trim())
    expect(msg.method).toBe('mining.suggest_difficulty')
    expect(msg.params).toEqual([16.0])

    // Simulate server rejection
    transport.push(`{"id":${msg.id},"result":null,"error":[20,"unsupported",null]}`)
    await expect(promise).rejects.toThrow('Stratum error 20: unsupported')
  })

  it('extranonceSubscribe sends correct wire format', async () => {
    const transport = new FakeTransport()
    const client = new StratumClient(transport)
    await client.connect()

    const promise = client.extranonceSubscribe()
    const sent = transport.sent.find(s => s.includes('extranonce.subscribe'))
    expect(sent).toBeDefined()

    const msg = JSON.parse(sent!.trim())
    expect(msg.method).toBe('mining.extranonce.subscribe')
    expect(msg.params).toEqual([])

    // Simulate server acceptance
    transport.push(`{"id":${msg.id},"result":true,"error":null}`)
    expect(await promise).toBe(true)
  })
})
