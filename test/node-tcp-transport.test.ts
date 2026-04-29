import { createServer, type Server, type Socket } from 'node:net'
import { NodeTcpStratumTransport } from '../lib/transport/node-tcp.js'

/**
 * Integration-style tests for Node TCP transport against a local ephemeral
 * TCP server.
 */
describe('NodeTcpStratumTransport', () => {
  let server: Server
  let port: number
  let serverSocket: Socket | null = null

  beforeEach(async () => {
    await new Promise<void>(resolve => {
      server = createServer(socket => {
        serverSocket = socket
      })
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          throw new Error('Failed to resolve test server address')
        }
        port = address.port
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve())
    })
  })

  it('connects, receives data, and sends data', async () => {
    const transport = new NodeTcpStratumTransport('127.0.0.1', port)

    let receivedByClient = ''
    transport.onData(data => {
      receivedByClient += data
    })

    await transport.connect()

    // Server -> client
    await new Promise<void>(resolve => {
      serverSocket?.write('{"id":1}\n', 'utf8', () => resolve())
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(receivedByClient).toContain('{"id":1}\n')

    // Client -> server
    const receivedByServer = await new Promise<string>(resolve => {
      serverSocket?.once('data', chunk => {
        resolve(chunk.toString('utf8'))
      })
      transport.send('{"id":2}\n')
    })

    expect(receivedByServer).toBe('{"id":2}\n')
    transport.close()
  })

  it('throws when sending before connect', () => {
    const transport = new NodeTcpStratumTransport('127.0.0.1', port)
    expect(() => transport.send('{"id":1}\n')).toThrow('Transport not connected')
  })
})
