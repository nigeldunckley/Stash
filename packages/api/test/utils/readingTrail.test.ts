import { expect } from 'chai'
import 'mocha'
import {
  capTrail,
  formatTrail,
  mergeTrail,
  parseTrail,
} from '../../src/utils/readingTrail'

describe('reading trail', () => {
  it('parses ranges and rejects bad ones', () => {
    expect(parseTrail('0-120,300-410')).to.eql([
      [0, 120],
      [300, 410],
    ])
    expect(parseTrail('')).to.eql([])
    expect(parseTrail(null)).to.eql([])
    expect(parseTrail('5-2')).to.be.undefined
    expect(parseTrail('0-1001')).to.be.undefined
    expect(parseTrail('a-b')).to.be.undefined
  })

  it('joins what two devices read', () => {
    const merged = mergeTrail(
      parseTrail('0-100,500-600') ?? [],
      parseTrail('90-200,601-700,900-950') ?? []
    )
    expect(formatTrail(merged)).to.eql('0-200,500-700,900-950')
  })

  it('keeps a merged trail within 200 ranges', () => {
    const a = Array.from({ length: 200 }, (_, i) => `${i * 4}-${i * 4}`)
    const b = Array.from({ length: 50 }, (_, i) => `${i * 4 + 2}-${i * 4 + 2}`)
    const capped = capTrail(
      mergeTrail(parseTrail(a.join(',')) ?? [], parseTrail(b.join(',')) ?? [])
    )
    expect(capped.length).to.eql(200)
    expect(parseTrail(formatTrail(capped))).to.eql(capped)
    expect(capped[0][0]).to.eql(0)
    expect(capped[capped.length - 1][1]).to.eql(796)
  })
})
