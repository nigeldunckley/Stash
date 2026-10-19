import { styled } from '../../tokens/stitches.config'
import type { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'

// A cover set from the words, for items without a picture: the title large
// in the reading face, the source small in mono, in one of a few layouts
// drawn from the house type and colours. The same title always gets the
// same cover. Sizes are in container units, so one cover fits a 72px row
// thumbnail and a full Home card alike.

export type TypeCoverProps = {
  title: string
  source?: string
  // e.g. "9 min"
  length?: string
  // A line you highlighted, used as the cover when there is one.
  quote?: string
  newsletter?: boolean
  // A row thumbnail gets a simpler cover than a card. Left out, the cover
  // picks by its own width.
  small?: boolean
}

const Auto = styled('span', {
  display: 'block',
  width: '100%',
  height: '100%',
  containerType: 'size',
  '& > [data-size="small"]': { display: 'none' },
  '@container (max-width: 150px)': {
    '& > [data-size="small"]': { display: 'block' },
    '& > [data-size="large"]': { display: 'none' },
  },
})

type Layout =
  | 'bleed'
  | 'ink'
  | 'quote'
  | 'accent'
  | 'number'
  | 'split'
  | 'spine'

const Root = styled('span', {
  display: 'block',
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
  containerType: 'size',
  textAlign: 'left',
  lineHeight: 1,
  background: '$stSurface',
  color: '$stInk',
  variants: {
    layout: {
      bleed: {},
      ink: { background: '$stInk', color: '$stSurface' },
      quote: {},
      accent: { background: '$stAccent', color: '#0A0A0B' },
      number: { background: '$stSunken' },
      split: {},
      spine: {},
    },
  },
})

const Serif = styled('span', {
  display: 'block',
  fontFamily: '$serif',
  fontWeight: 500,
  letterSpacing: '-0.03em',
  overflowWrap: 'anywhere',
})

const Mono = styled('span', {
  display: 'block',
  fontFamily: '$mono',
  fontWeight: 500,
  fontSize: 'max(8px, 3.6cqw)',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: '$stMuted',
})

const Square = styled('span', {
  position: 'absolute',
  right: '6cqw',
  bottom: '6cqw',
  width: 'max(5px, 3cqw)',
  height: 'max(5px, 3cqw)',
  background: '$stAccent',
})

const hash = (text: string) => {
  let value = 0
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) | 0
  }
  return Math.abs(value)
}

const NUMBER = /\b\d[\d.,]*\b/

const layoutFor = (props: TypeCoverProps): Layout => {
  const seed = hash(props.title)
  if (props.newsletter) return 'accent'
  if (!props.small && props.quote) return 'quote'
  if (NUMBER.test(props.title) && seed % 3 == 0) return 'number'
  // A thin capital (I, J, 1…) makes a poor big initial.
  const narrow = /^[^\p{L}\p{N}]*[IJLijlft1]/u.test(props.title.trim())
  const choices: Layout[] =
    props.small && narrow
      ? ['bleed']
      : props.small
      ? ['bleed', 'ink']
      : ['bleed', 'ink', 'split', 'spine']
  return choices[seed % choices.length]
}

const words = (text: string, count: number) =>
  text.split(/\s+/).slice(0, count).join(' ')

const initial = (text: string) =>
  (text.match(/\p{L}|\p{N}/u)?.[0] ?? '·').toUpperCase()

export function TypeCover(props: TypeCoverProps): JSX.Element {
  if (props.small === undefined) {
    return (
      <Auto aria-hidden="true">
        <span data-size="small" style={{ width: '100%', height: '100%' }}>
          <Cover {...props} small />
        </span>
        <span
          data-size="large"
          style={{ display: 'block', width: '100%', height: '100%' }}
        >
          <Cover {...props} small={false} />
        </span>
      </Auto>
    )
  }
  return <Cover {...props} />
}

function Cover(props: TypeCoverProps): JSX.Element {
  const layout = layoutFor(props)
  const title = props.title.trim()
  const mono = [props.source, props.length].filter(Boolean).join(' · ')

  if (props.small) {
    return (
      <Root layout={layout} aria-hidden="true">
        {layout == 'ink' || layout == 'accent' ? (
          <Serif
            css={{
              position: 'absolute',
              right: '-4cqw',
              top: '-24cqh',
              fontSize: '150cqh',
              lineHeight: 1,
              opacity: layout == 'ink' ? 0.9 : 1,
              color: layout == 'ink' ? '$stMuted' : 'inherit',
            }}
          >
            {initial(title)}
          </Serif>
        ) : layout == 'number' ? (
          <Mono
            css={{
              position: 'absolute',
              left: '10cqw',
              bottom: '12cqh',
              fontSize: '44cqh',
              letterSpacing: '-0.05em',
              color: '$stInk',
            }}
          >
            {title.match(NUMBER)?.[0]}
          </Mono>
        ) : (
          <Serif
            css={{
              position: 'absolute',
              left: '9cqw',
              top: '14cqh',
              fontSize: '46cqh',
              whiteSpace: 'nowrap',
            }}
          >
            {words(title, 2)}
          </Serif>
        )}
        {layout != 'accent' && layout != 'ink' && <Square />}
      </Root>
    )
  }

  switch (layout) {
    case 'ink':
      return (
        <Root layout="ink" aria-hidden="true">
          <Serif
            css={{
              position: 'absolute',
              right: '-6cqw',
              top: '-18cqh',
              fontSize: '100cqh',
              color: '$stMuted',
              opacity: 0.35,
            }}
          >
            {initial(title)}
          </Serif>
          <span
            style={{
              position: 'absolute',
              left: '7cqw',
              right: '7cqw',
              bottom: '7cqw',
              display: 'grid',
              gap: '3cqw',
            }}
          >
            <Serif
              css={{
                fontSize: '9cqw',
                lineHeight: 1.06,
                letterSpacing: '-0.015em',
              }}
            >
              {words(title, 12)}
            </Serif>
            {mono && <Mono css={{ color: '$stLineStrong' }}>{mono}</Mono>}
          </span>
        </Root>
      )
    case 'quote':
      return (
        <Root
          layout="quote"
          aria-hidden="true"
          css={{
            padding: '7cqw',
            display: 'grid',
            alignContent: 'start',
            gap: '4cqw',
          }}
        >
          {props.source && (
            <Mono css={{ color: '$stAccentText' }}>{props.source}</Mono>
          )}
          <span
            style={{
              height: 1,
              borderTop: '1px solid',
              borderBottom: '1px solid var(--colors-stLine)',
            }}
          />
          <Serif
            css={{
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '8.5cqw',
              lineHeight: 1.18,
              letterSpacing: '-0.01em',
            }}
          >
            “{words(props.quote ?? '', 22)}”
          </Serif>
          <span
            style={{
              position: 'absolute',
              left: '7cqw',
              right: '7cqw',
              bottom: '7cqw',
              fontSize: '4.8cqw',
              lineHeight: 1.35,
              color: 'var(--colors-stInk2)',
            }}
          >
            {title}
          </span>
        </Root>
      )
    case 'accent':
      return (
        <Root layout="accent" aria-hidden="true">
          <Mono
            css={{
              position: 'absolute',
              left: '7cqw',
              top: '7cqw',
              color: 'inherit',
            }}
          >
            {props.source ?? 'Newsletter'}
          </Mono>
          <Serif
            css={{
              position: 'absolute',
              left: '7cqw',
              right: '7cqw',
              bottom: '7cqw',
              fontSize: '11cqw',
              lineHeight: 1.0,
            }}
          >
            {words(title, 9)}
          </Serif>
        </Root>
      )
    case 'number':
      return (
        <Root layout="number" aria-hidden="true">
          <Mono
            css={{
              position: 'absolute',
              left: '7cqw',
              top: '6cqw',
              fontSize: '22cqw',
              letterSpacing: '-0.05em',
              color: '$stInk',
              overflow: 'visible',
            }}
          >
            {title.match(NUMBER)?.[0]}
          </Mono>
          <span
            style={{
              position: 'absolute',
              left: '7cqw',
              right: '7cqw',
              bottom: '7cqw',
              display: 'grid',
              gap: '3cqw',
            }}
          >
            <Serif
              css={{
                fontSize: '7.6cqw',
                lineHeight: 1.12,
                letterSpacing: '-0.01em',
              }}
            >
              {words(title, 12)}
            </Serif>
            {mono && <Mono>{mono}</Mono>}
          </span>
        </Root>
      )
    case 'split': {
      const [first, ...rest] = title.split(/\s+/)
      return (
        <Root layout="split" aria-hidden="true">
          {mono && (
            <Mono
              css={{
                position: 'absolute',
                left: '7cqw',
                right: '7cqw',
                top: '7cqw',
              }}
            >
              {mono}
            </Mono>
          )}
          <span
            style={{
              position: 'absolute',
              left: '7cqw',
              right: '7cqw',
              bottom: '7cqw',
            }}
          >
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--fonts-inter)',
                fontWeight: 600,
                fontSize: '17cqw',
                letterSpacing: '-0.045em',
                lineHeight: 0.95,
              }}
            >
              {first}
            </span>
            <Serif
              css={{
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '11cqw',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}
            >
              {words(rest.join(' '), 6)}
            </Serif>
          </span>
        </Root>
      )
    }
    case 'spine':
      return (
        <Root layout="spine" aria-hidden="true" css={{ display: 'flex' }}>
          <Mono
            css={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              padding: '0 4cqw',
              borderLeft: '1px solid $stLine',
              letterSpacing: '0.12em',
            }}
          >
            {mono || ' '}
          </Mono>
          <Serif
            css={{
              alignSelf: 'flex-end',
              padding: '7cqw',
              fontSize: '10cqw',
              lineHeight: 1.04,
              letterSpacing: '-0.015em',
            }}
          >
            {words(title, 12)}
          </Serif>
        </Root>
      )
    default:
      return (
        <Root layout="bleed" aria-hidden="true">
          <Serif
            css={{
              position: 'absolute',
              left: '7cqw',
              top: '6cqw',
              right: '-30cqw',
              fontSize: '22cqw',
              lineHeight: 0.9,
              letterSpacing: '-0.035em',
            }}
          >
            {words(title, 8)}
          </Serif>
          {props.source && (
            <Mono
              css={{
                position: 'absolute',
                left: '7cqw',
                bottom: '6cqw',
                right: '16cqw',
                paddingTop: '2cqw',
                background: '$stSurface',
              }}
            >
              {props.source}
            </Mono>
          )}
          <Square />
        </Root>
      )
  }
}

// The cover's details for a library item.
export const typeCoverFor = (
  item: Pick<
    LibraryItemNode,
    'title' | 'siteName' | 'subscription' | 'wordsCount' | 'highlights'
  >,
  source?: string
): TypeCoverProps => {
  const minutes = formatMinutes(readingMinutes(item.wordsCount))
  const quote = item.highlights
    ?.map((highlight) => highlight.quote?.trim() ?? '')
    .find((text) => text.length >= 30 && text.length <= 200)
  return {
    title: item.title,
    source: source ?? item.siteName,
    length: minutes || undefined,
    quote,
    newsletter: !!item.subscription && !/^https?:\/\//i.test(item.subscription),
  }
}
