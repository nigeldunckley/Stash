import { expect } from 'chai'
import 'mocha'
import {
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
})
