import { sha256 } from '@noble/hashes/sha256'
import type { NativeNotifyParams } from '../protocol/types.js'

/**
 * Decode a hex string into bytes.
 *
 * @throws Error when the hex length is odd.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.toLowerCase()
  if (clean.length % 2 !== 0) throw new Error('Invalid hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Encode bytes into lower-case hex. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Perform SHA256(SHA256(data)). */
export function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data))
}

/** Perform SHA256(SHA256(SHA256(data))). */
export function tripleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(sha256(data)))
}

/**
 * Concatenate byte arrays into a single contiguous view.
 */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(len)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

/**
 * Rebuild full coinbase bytes from job fragments and extranonces.
 */
export function buildCoinbase(
  notify: NativeNotifyParams,
  extranonce1: string,
  extranonce2: string,
): Uint8Array {
  return hexToBytes(
    notify.coinbase1 + extranonce1 + extranonce2 + notify.coinbase2,
  )
}

/**
 * Recompute merkle root from coinbase hash and merkle branch list.
 *
 * Branch order follows Stratum's left-concatenation convention used by lotusd.
 */
export function computeMerkleRoot(
  coinbaseHash: Uint8Array,
  merkleBranches: string[],
): Uint8Array {
  let current = coinbaseHash
  for (const branch of merkleBranches) {
    current = doubleSha256(concatBytes([current, hexToBytes(branch)]))
  }
  return current
}

/**
 * Convert floating-point share difficulty into a target bigint.
 *
 * Uses the standard diff1 target for SHA-256 and fixed-point scaling to
 * avoid large precision loss from direct floating-point division.
 */
export function difficultyToTarget(difficulty: number): bigint {
  const diff1 = BigInt(
    '0x00000000ffff0000000000000000000000000000000000000000000000000000',
  )
  if (difficulty <= 0) return diff1
  const scale = 1_000_000n
  return (
    (diff1 * scale) / BigInt(Math.max(1, Math.floor(difficulty * 1_000_000)))
  )
}
