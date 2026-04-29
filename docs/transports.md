# Transport methodology

This package models Stratum transport as a line-oriented stream contract (`StratumTransport`) and keeps protocol logic independent from socket/runtime details.

## What lotusd Stratum supports today

After reviewing `lotusd/src/stratum/`:

- Downstream miner interface is **Stratum v1 over raw TCP sockets** (libevent listeners).
- Message framing is **newline-delimited JSON**.
- No native WebSocket listener exists in lotusd Stratum.
- Upstream pool proxying in lotusd is also TCP Stratum.

So, from a client perspective, the authoritative server transport is TCP.

## Why multiple client transports still matter

Even though lotusd speaks TCP, consumers run in different environments:

- Browser: cannot open raw TCP sockets.
- Node.js/server runtimes: can open raw TCP sockets.
- Other runtimes (Deno/Bun/mobile): may require custom socket primitives.

## Methodology for adding transports

1. Preserve the `StratumTransport` contract:
   - `connect`
   - `send`
   - `close`
   - callback registration for data/error/close

2. Keep transport payload semantics identical:
   - UTF-8 text stream
   - newline-delimited JSON frames

3. Keep transport modules runtime-scoped:
   - Browser-safe entrypoint (`.`) must not require Node built-ins.
   - Runtime-specific transports should ship via subpath exports (for example `./node`).

4. Reuse protocol parsing in client layer:
   - chunk aggregation and frame extraction must stay centralized in `StratumLineBuffer`
   - avoid per-transport protocol duplication

5. Test each transport at its boundary:
   - connection lifecycle
   - send/receive behavior
   - error/close propagation

## Current transport matrix

- `WebSocketStratumTransport` (browser-compatible; requires ws bridge/proxy)
- `NodeTcpStratumTransport` (direct TCP to lotusd Stratum listener; Node.js only)

## Future transport candidates

- Deno TCP transport
- Bun TCP transport
- React Native socket transport

Each should be added as a separate runtime-focused module and export subpath, while reusing the same core client/protocol layers.
