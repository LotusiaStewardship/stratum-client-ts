/**
 * JSON-RPC request shape used by Stratum v1 over newline-delimited JSON.
 *
 * @typeParam T - The method-specific params payload type.
 */
export interface StratumRequest<T = unknown> {
  /** Client-generated request correlation id. */
  id: number
  /** Stratum method name, e.g. `mining.subscribe`. */
  method: string
  /** Method argument payload, typically an array. */
  params: T
}

/**
 * JSON-RPC response shape returned by a Stratum server.
 *
 * @typeParam T - The expected result payload type.
 */
export interface StratumResponse<T = unknown> {
  /** The request id this response belongs to. */
  id: number
  /** Method result payload when the request succeeds. */
  result: T
  /** Error tuple when the request fails, otherwise null. */
  error: StratumErrorTuple | null
}

/**
 * JSON-RPC notification shape sent by a Stratum server.
 *
 * Notifications are not correlated with request ids.
 * In practice, Stratum omits `id` or uses null.
 *
 * @typeParam T - The notification params payload type.
 */
export interface StratumNotification<T = unknown> {
  /** Optional JSON-RPC notification id placeholder; usually omitted/null. */
  id?: null
  /** Notification method, e.g. `mining.notify` or `mining.set_difficulty`. */
  method: string
  /** Notification payload. */
  params: T
}

/**
 * Canonical Stratum error tuple.
 *
 * `[code, message, data]`
 */
export type StratumErrorTuple = [number, string, unknown]

/**
 * Union of all protocol message envelopes that can appear on the wire.
 */
export type StratumMessage =
  | StratumRequest
  | StratumResponse
  | StratumNotification

/**
 * Decoded result of `mining.subscribe`.
 */
export interface SubscribeResult {
  /** Server-advertised subscriptions returned by the handshake. */
  subscriptions: [string, string][]
  /** Session-unique extranonce1 in hex (Lotus defaults to 4 bytes / 8 hex chars). */
  extranonce1: string
  /** Required extranonce2 width in bytes. */
  extranonce2Size: number
}

/**
 * Lotus native `mining.notify` payload decoded into named fields.
 *
 * Maps the 13-element positional array emitted by stratum-server-nng:
 *   [jobId, prevHash, coinbase1, coinbase2, merkleBranches,
 *    version, nbits, ntime, cleanJobs,
 *    blockHeight, epochHashHex, extendedMetadataHashHex, blockSize]
 */
export interface NativeNotifyParams {
  /** Hex job id string. */
  jobId: string
  /** Previous block hash in Stratum ordering. */
  prevHash: string
  /** Coinbase prefix hex. */
  coinbase1: string
  /** Coinbase suffix hex. */
  coinbase2: string
  /** Merkle branch list as hex hashes. */
  merkleBranches: string[]
  /** Block version string (hex, e.g. "20000000"). */
  version: string
  /** Compact target bits (hex, 4 bytes). */
  nbits: string
  /** Lotus block time field (hex, 12 hex chars / 6 bytes). */
  ntime: string
  /** True when miners must discard old jobs. */
  cleanJobs: boolean
  /** Block height being mined. */
  blockHeight: number
  /** Lotus epoch hash (hex). */
  epochHashHex: string
  /** Lotus extended metadata hash (hex). */
  extendedMetadataHashHex: string
  /** Total candidate block size in bytes. */
  blockSize: number
}

/**
 * Params for `mining.set_extranonce` notification.
 *
 * [extranonce1_hex, extranonce2_size_bytes]
 */
export interface SetExtranonceParams {
  /** Session-unique extranonce1 in hex. */
  extranonce1: string
  /** Required extranonce2 width in bytes. */
  extranonce2Size: number
}

/**
 * Native Lotus share submission fields for `mining.submit`.
 */
export interface NativeSubmitParams {
  /** Worker identity (`<lotus-address>.<worker-name>` in lotusd deployments). */
  workerName: string
  /** Hex job id string received from `mining.notify`. */
  jobId: string
  /** Extranonce2 hex, sized according to subscribe result. */
  extranonce2: string
  /** Submitted ntime in Lotus native width (12 hex chars). */
  ntime: string
  /** Submitted nonce in Lotus native width (16 hex chars). */
  nonce: string
}
