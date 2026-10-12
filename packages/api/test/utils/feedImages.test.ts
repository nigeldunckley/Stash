import { expect } from 'chai'
import 'mocha'
import { imageFromHtml, largestMediaImage } from '../../src/utils/feedImages'

describe('feed images', () => {
  it('chooses the largest image from media:content', () => {
    expect(
      largestMediaImage([
        {
          $: {
            url: 'https://example.com/small.jpg',
            width: '320',
            height: '180',
            medium: 'image',
          },
        },
        {
          $: {
            url: 'https://example.com/video.mp4',
            width: '1920',
            height: '1080',
            type: 'video/mp4',
          },
        },
        {
          $: {
            url: 'https://example.com/large.jpg',
            width: '1200',
            height: '675',
            type: 'image/jpeg',
          },
        },
      ])
    ).to.equal('https://example.com/large.jpg')
  })

  it('uses a large srcset picture instead of a placeholder', () => {
    expect(
      imageFromHtml(
        '<img src="/placeholder.jpg" width="1" height="1" srcset="/story-320.jpg 320w, /story-1200.jpg 1200w">',
        'https://example.com/story'
      )
    ).to.equal('https://example.com/story-1200.jpg')
  })

  it('chooses the largest available article picture', () => {
    expect(
      imageFromHtml(
        '<img src="/small.jpg" width="250"><img src="/large.jpg" width="1100">',
        'https://example.com/story'
      )
    ).to.equal('https://example.com/large.jpg')
  })

  it('skips tracking pixels and resolves lazy-loaded images', () => {
    expect(
      imageFromHtml(
        '<img src="/pixel.gif" width="1" height="1"><img data-src="/lead.jpg">',
        'https://example.com/story'
      )
    ).to.equal('https://example.com/lead.jpg')
  })
})
