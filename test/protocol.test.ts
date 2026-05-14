import {
  decodeNativeNotify,
  parseStratumLine,
  serializeNotify,
  serializeRequest,
  StratumLineBuffer,
} from '../lib/protocol/codec.js'

/**
 * Protocol codec tests focus on wire-shape interoperability with lotusd's
 * newline JSON Stratum messages.
 */
describe('protocol codec', () => {
  it('buffers and extracts lines', () => {
    const b = new StratumLineBuffer()
    b.append('{"id":1}\n{"id":2}\n')
    expect(b.extractLines()).toEqual(['{"id":1}', '{"id":2}'])
  })

  it('parses request and notification and response', () => {
    const req = parseStratumLine(
      '{"id":1,"method":"mining.subscribe","params":[]}',
    )
    const notif = parseStratumLine(
      '{"method":"mining.set_difficulty","params":[0.001]}',
    )
    const resp = parseStratumLine('{"id":1,"result":true,"error":null}')

    expect(req).toBeTruthy()
    expect(notif).toBeTruthy()
    expect(resp).toBeTruthy()
  })

  it('serializes newline terminated JSON', () => {
    // Stratum framing requires each payload to end with an LF separator.
    expect(serializeRequest(1, 'mining.ping', []).endsWith('\n')).toBe(true)
    expect(serializeNotify('mining.notify', []).endsWith('\n')).toBe(true)
  })

  it('decodes lotus native notify shape', () => {
    const p = decodeNativeNotify([
      '1a',                                // jobId
      '00'.repeat(32),                     // prevHash
      'aa',                                // coinbase1
      'bb',                                // coinbase2
      ['cc'],                              // merkleBranches
      '20000000',                          // version (hex)
      'ffff001d',                          // nbits
      '010203040506',                      // ntime (12 hex chars)
      true,                                // cleanJobs (boolean)
      1000,                                // blockHeight
      'epoch_hash_hex_value',              // epochHashHex
      'ext_meta_hash_hex_value',           // extendedMetadataHashHex
      8192,                                // blockSize
    ])

    expect(p.jobId).toBe('1a')
    expect(p.cleanJobs).toBe(true)
    expect(p.version).toBe('20000000')
    expect(p.blockHeight).toBe(1000)
    expect(p.epochHashHex).toBe('epoch_hash_hex_value')
    expect(p.extendedMetadataHashHex).toBe('ext_meta_hash_hex_value')
    expect(p.blockSize).toBe(8192)
  })
})
