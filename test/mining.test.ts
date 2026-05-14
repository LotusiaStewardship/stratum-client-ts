import {
  buildCoinbase,
  bytesToHex,
  computeMerkleRoot,
  difficultyToTarget,
  doubleSha256,
  hexToBytes,
  tripleSha256,
  validateSubmitShape,
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
      version: '20000000',
      nbits: 'ffff001d',
      ntime: '010203040506',
      cleanJobs: true,
      blockHeight: 1000,
      epochHashHex: 'epoch_hash_hex',
      extendedMetadataHashHex: 'ext_meta_hash',
      blockSize: 8192,
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

  describe('validateSubmitShape', () => {
    const valid = {
      workerName: 'addr.rig',
      jobId: 'j1',
      extranonce2: 'aabbccdd',
      ntime: '010203040506',
      nonce: '0011223344556677',
    }

    it('accepts valid params', () => {
      expect(validateSubmitShape(valid, 4)).toBeUndefined()
    })

    it('rejects wrong extranonce2 length', () => {
      expect(validateSubmitShape({ ...valid, extranonce2: 'aabb' }, 4)).toMatchObject({ field: 'extranonce2' })
    })

    it('rejects wrong ntime length', () => {
      expect(validateSubmitShape({ ...valid, ntime: '0102' }, 4)).toMatchObject({ field: 'ntime' })
    })

    it('rejects wrong nonce length', () => {
      expect(validateSubmitShape({ ...valid, nonce: '0102' }, 4)).toMatchObject({ field: 'nonce' })
    })

    it('rejects non-hex', () => {
      expect(validateSubmitShape({ ...valid, nonce: 'zzzzzzzzzzzzzzzz' }, 4)).toMatchObject({ field: 'nonce' })
    })
  })
})
