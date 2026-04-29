import {
  buildCoinbase,
  bytesToHex,
  computeMerkleRoot,
  difficultyToTarget,
  doubleSha256,
  hexToBytes,
  tripleSha256,
} from '../lib/mining/native.js'

/**
 * Unit tests for deterministic native mining helpers.
 */
describe('native mining utils', () => {
  it('converts hex bytes roundtrip', () => {
    const bytes = hexToBytes('deadbeef')
    expect(bytesToHex(bytes)).toBe('deadbeef')
  })

  it('computes hashes', () => {
    const data = new Uint8Array([1, 2, 3])
    expect(doubleSha256(data)).toHaveLength(32)
    expect(tripleSha256(data)).toHaveLength(32)
  })

  it('builds coinbase and merkle root', () => {
    // Minimal notify fixture with an empty branch set.
    const notify = {
      jobId: '1',
      prevHash: '00'.repeat(32),
      coinbase1: 'aa',
      coinbase2: 'bb',
      merkleBranches: [],
      layer3Hash: '00'.repeat(32),
      nbits: 'ffff001d',
      ntime: '010203040506',
      reserved: '00000000',
      cleanJobs: true,
    }

    const coinbase = buildCoinbase(notify, '01020304', 'aabbccdd')
    const root = computeMerkleRoot(doubleSha256(coinbase), [])

    expect(root).toHaveLength(32)
  })

  it('converts difficulty to target', () => {
    // Higher difficulty means smaller target.
    const t1 = difficultyToTarget(1)
    const t2 = difficultyToTarget(2)
    expect(t2 < t1).toBe(true)
  })
})
