import { ArrowUpRight } from '@phosphor-icons/react'
import { ArticleAttributes } from '../../../lib/networking/library_items/useLibraryItems'
import { formattedLongDate } from '../../../lib/dateFormatting'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import {
  faviconFor,
  timeAgoInSentence,
  shouldHideUrl,
  siteName,
} from '../../../lib/textFormatting'
import { removeHTMLTags } from '../../patterns/ArticleSubtitle'
import { SiteIcon } from '../../elements/stash'
import { styled } from '../../tokens/stitches.config'

const Head = styled('header', {
  display: 'grid',
  width: '100%',
  marginBottom: '28px',
  color: 'var(--font-color)',
  '@smDown': { marginBottom: '20px' },
})

const Meta = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 10px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--font-color-muted)',
  '& > span + span::before': {
    content: '"·"',
    marginRight: '10px',
  },
  '@smDown': { fontSize: '10px' },
})

const Source = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  // The kicker: where it's from, in the accent, as a magazine names its
  // section.
  color: '$stAccentText',
})

// The title uses the reading face, so it always matches the text below.
const Title = styled('h1', {
  margin: '18px 0 0',
  fontFamily: 'var(--text-font-family)',
  fontWeight: 500,
  fontSize: 'clamp(34px, 5vw, 54px)',
  lineHeight: 1.02,
  letterSpacing: '-0.024em',
  textWrap: 'balance',
  overflowWrap: 'break-word',
  color: 'var(--font-color)',
  '@smDown': { fontSize: '31px', lineHeight: 1.06, marginTop: '14px' },
})

const Dek = styled('p', {
  margin: '16px 0 0',
  fontFamily: 'var(--text-font-family)',
  fontStyle: 'italic',
  fontSize: 'calc(var(--text-font-size) * 1.12)',
  lineHeight: 1.42,
  color: 'var(--font-color-muted)',
  textWrap: 'pretty',
})

const Byline = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 8px',
  marginTop: '22px',
  // Set over a double rule, ink over a hairline, as the folios are.
  padding: '10px 0',
  borderTop: '1px solid var(--font-color)',
  borderBottom: '1px solid $stLine',
  fontFamily: '$inter',
  fontSize: '13px',
  color: 'var(--font-color-muted)',
  '& b': { fontWeight: 500, color: 'var(--font-color)' },
  '& > span + span::before': {
    content: '"·"',
    marginRight: '8px',
  },
  '&:empty': { padding: 0, height: '1px' },
  '@smDown': { fontSize: '12px', marginTop: '16px' },
})

const Original = styled('a', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  color: 'inherit',
  textDecoration: 'none',
  '&:hover': { color: 'var(--font-color)' },
})

const plainText = (html: string, limit: number): string =>
  html
    .slice(0, limit)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const normalise = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().toLowerCase()

// A description is worth showing under the title only when it is a real
// standfirst: not too long, and not just the opening of the article (which
// is what most extracted descriptions are).
export const standfirst = (
  description: string | undefined,
  title: string,
  content: string
): string | undefined => {
  const text = removeHTMLTags(description).replace(/\s+/g, ' ').trim()
  if (text.length < 24 || text.length > 280) {
    return undefined
  }
  if (normalise(text) == normalise(title)) {
    return undefined
  }
  const probe = normalise(text)
    .replace(/(\.\.\.|…)$/, '')
    .slice(0, 60)
  const opening = plainText(content, 6000)
  if (opening.includes(probe)) {
    return undefined
  }
  return text
}

type ReaderArticleHeadProps = {
  article: ArticleAttributes
  title: string
}

// The opening of an article: a quiet line saying where it is from, the
// title, a standfirst when the page has one, and the byline.
export function ReaderArticleHead(props: ReaderArticleHeadProps): JSX.Element {
  const { article } = props
  const site = siteName(
    article.originalArticleUrl,
    article.url,
    article.siteName
  )
  const minutes = formatMinutes(readingMinutes(article.wordsCount))
  const dek = standfirst(article.description, props.title, article.content)
  const author = removeHTMLTags(article.author).trim()
  const showOriginal = !shouldHideUrl(article.originalArticleUrl)
  const saved = timeAgoInSentence(article.savedAt)

  return (
    <Head>
      <Meta>
        {site && (
          <Source>
            <SiteIcon
              src={article.siteIcon}
              fallbackSrc={faviconFor(article.originalArticleUrl)}
              name={site}
              size={16}
            />
            {site}
          </Source>
        )}
        {minutes && <span>{minutes}</span>}
        {saved && <span>Saved {saved}</span>}
      </Meta>
      <Title data-testid="article-headline">{props.title}</Title>
      {dek && <Dek>{dek}</Dek>}
      {/* Always drawn: with nothing to say, it is just the rule. */}
      {
        <Byline>
          {author && (
            <span>
              By <b>{author}</b>
            </span>
          )}
          {article.publishedAt && (
            <span>{formattedLongDate(article.publishedAt)}</span>
          )}
          {showOriginal && (
            <span>
              <Original
                href={article.originalArticleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Original
                <ArrowUpRight size={12} aria-hidden />
              </Original>
            </span>
          )}
        </Byline>
      }
    </Head>
  )
}
