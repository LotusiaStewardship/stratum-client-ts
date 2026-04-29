# stratum-client-ts

Browser-compatible TypeScript Stratum v1 client for Lotus native SHA-256 (LotusHash) mining.

## Status

- Protocol scope: native SHA-256 Stratum flow only
- Explicitly out of scope: AuxPow and merged-mining submit/notify handling

## Features

- Stratum JSON line protocol codec
- Streaming line buffer with max-line guardrails
- Typed client API for:
  - `mining.subscribe`
  - `mining.authorize`
  - `mining.submit` (native share shape)
  - `mining.ping`
- Notification handling for:
  - `mining.notify` (Lotus native 10-field shape)
  - `mining.set_difficulty`
- Browser-first transport via WebSocket abstraction
- Mining helpers for native work assembly:
  - Coinbase assembly
  - Merkle root reconstruction
  - Double/triple SHA-256 helpers
  - Difficulty-to-target conversion

## Installation

```bash
npm install stratum-client-ts
```

## Quick start

```ts
import { StratumClient, WebSocketStratumTransport } from 'stratum-client-ts'

const transport = new WebSocketStratumTransport('wss://your-stratum-proxy/ws')

const client = new StratumClient(transport, {
  onSetDifficulty: diff => {
    console.log('difficulty', diff)
  },
  onNotify: job => {
    console.log('job', job.jobId, job.cleanJobs)
  },
})

await client.connect()

const sub = await client.subscribe('my-browser-miner/1.0')
await client.authorize('lotus_address.worker1', 'x')

const accepted = await client.submitNativeShare({
  workerName: 'lotus_address.worker1',
  jobId: '1a',
  extranonce2: '00000000',
  ntime: '010203040506',
  nonce: '0000000000000000',
})

console.log('share accepted?', accepted)
```

## Transport support

### lotusd server transport review

`lotusd/src/stratum/` exposes Stratum v1 over raw TCP listeners with newline-delimited JSON framing. The in-node Stratum server does not expose native WebSocket transport.

### Implemented transports

- `WebSocketStratumTransport` (browser-compatible, requires ws bridge/proxy)
- `NodeTcpStratumTransport` via `stratum-client-ts/node` (direct TCP to lotusd)

### Node.js direct TCP example

```ts
import { StratumClient } from 'stratum-client-ts'
import { NodeTcpStratumTransport } from 'stratum-client-ts/node'

const transport = new NodeTcpStratumTransport('127.0.0.1', 3334)
const client = new StratumClient(transport)

await client.connect()
await client.subscribe('node-miner/1.0')
await client.authorize('lotus_address.worker1', 'x')
```

### Methodology

Transport expansion methodology is documented in `docs/transports.md`.

### Browser compatibility

Browsers cannot open raw TCP sockets, so production deployments should expose Stratum over a WebSocket bridge/proxy. The client is transport-abstracted and ships with a `WebSocketStratumTransport` implementation suitable for browser runtime.

## API summary

### `StratumClient`

- `connect(): Promise<void>`
- `close(): void`
- `subscribe(userAgent?: string): Promise<SubscribeResult>`
- `authorize(workerName: string, password?: string): Promise<boolean>`
- `submitNativeShare(params: NativeSubmitParams): Promise<boolean>`
- `ping(): Promise<unknown>`

### Events

- `onNotify(job: NativeNotifyParams)`
- `onSetDifficulty(difficulty: number)`
- `onClose()`
- `onError(error)`

## Development

```bash
npm install
npm run format
npm run lint
npm test
npm run build
```

## Build and publish pipeline

Build pipeline mirrors the xpi-ts pattern:

- ESM output: `dist/esm`
- CJS output: `dist/cjs`
- Types output: `dist/types`
- Build validation ensures package export targets exist

## Testing

- Unit tests cover protocol parsing/serialization, client request-response flow, notification handling, and native mining helper utilities.
- Run coverage with:

```bash
npm run test:coverage
```

## Security notes

- Never embed production wallet secrets in miner worker names/passwords.
- Do not trust upstream messages without additional validation at your integration layer.
- If exposing Stratum through WebSocket, enforce TLS and authentication/rate limits at the gateway.

## License

MIT
