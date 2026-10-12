import { expect } from 'chai'
import 'mocha'
import {
  CHECK_INTERVAL_MS,
  conditionalHeaders,
  nextCheckAt,
} from '../../src/jobs/rss/refreshFeed'

describe('feed check schedule', () => {
  it('makes every feed due again before the next five-minute sweep', () => {
    const now = Date.UTC(2026, 9, 12, 20, 0, 0)
    const next = nextCheckAt(now).getTime()
    expect(next).to.be.greaterThan(now)
    expect(next).to.be.lessThan(now + CHECK_INTERVAL_MS)
    expect(CHECK_INTERVAL_MS).to.equal(5 * 60 * 1000)
  })

  it('asks whether the feed changed only when it knows what it last saw', () => {
    expect(conditionalHeaders(undefined)).to.eql({})
    expect(
      conditionalHeaders({
        etag: '"abc"',
        lastModified: 'Mon, 12 Oct 2026 19:00:00 GMT',
        checksum: 'x',
      })
    ).to.eql({
      'if-none-match': '"abc"',
      'if-modified-since': 'Mon, 12 Oct 2026 19:00:00 GMT',
    })
    expect(conditionalHeaders({ checksum: 'x' })).to.eql({})
  })
})
