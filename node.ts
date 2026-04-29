/**
 * Node-only entrypoint.
 *
 * Import this subpath when you need direct TCP connectivity to a Stratum
 * server (no WebSocket bridge).
 */
export * from './lib/transport/node-tcp.js'
