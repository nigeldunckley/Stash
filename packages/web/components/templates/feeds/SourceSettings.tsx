import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { unsubscribeMutation } from '../../../lib/networking/mutations/unsubscribeMutation'
import { updateSubscriptionMutation } from '../../../lib/networking/mutations/updateSubscriptionMutation'
import {
  FetchContentType,
  Subscription,
} from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import { timeAgo } from '../../../lib/textFormatting'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import { channelPageUrl, isYouTubeFeedUrl } from '../../../lib/youtube'
import { PanelLabel, SegmentedControl, Switch } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

const Row = styled('div', {
  display: 'grid',
  gap: '8px',
})

const Detail = styled('div', {
  fontFamily: '$inter',
  fontSize: '$caption',
  lineHeight: 1.45,
  color: '$stMuted',
  overflowWrap: 'anywhere',
  a: { color: '$stInk2' },
})

const Toggle = styled('label', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stInk2',
})

const Danger = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  height: '30px',
  padding: '0 10px',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  color: '$stAccentText',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: '$stAccentTint' },
  '&[data-confirm="true"]': {
    background: '$stAccent',
    borderColor: '$stAccent',
    color: '$stOnAccent',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

type FullText = 'ALWAYS' | 'WHEN_EMPTY' | 'NEVER'

// Settings for one feed: whether to fetch the full article (or, for a
// YouTube channel, whether to include Shorts), and unsubscribe.
export function SourceSettings(props: {
  subscription: Subscription
  onUnsubscribed: () => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const { subscription } = props
  const [fullText, setFullText] = useState<FullText>(
    (subscription.fetchContentType as FullText | undefined) ?? 'ALWAYS'
  )
  const [confirming, setConfirming] = useState(false)
  const channel = isYouTubeFeedUrl(subscription.url)
  const [includeShorts, setIncludeShorts] = useState(
    !!subscription.includeShorts
  )

  const changeShorts = async (value: boolean) => {
    setIncludeShorts(value)
    try {
      const result = await updateSubscriptionMutation({
        id: subscription.id,
        includeShorts: value,
      })
      if (result.updateSubscription.errorCodes?.length) {
        throw new Error(result.updateSubscription.errorCodes[0])
      }
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    } catch {
      setIncludeShorts(!value)
      showErrorToast('Could not update this channel')
    }
  }

  const changeFullText = async (value: FullText) => {
    const previous = fullText
    setFullText(value)
    try {
      const result = await updateSubscriptionMutation({
        id: subscription.id,
        fetchContentType: value as FetchContentType,
      })
      if (result.updateSubscription.errorCodes?.length) {
        throw new Error(result.updateSubscription.errorCodes[0])
      }
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    } catch {
      setFullText(previous)
      showErrorToast('Could not update this feed')
    }
  }

  const unsubscribe = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    const result = await unsubscribeMutation(subscription.name, subscription.id)
    if (result) {
      showSuccessToast(`Unsubscribed from ${subscription.name}`)
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      props.onUnsubscribed()
    } else {
      showErrorToast('Could not unsubscribe')
      setConfirming(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18, width: 'min(300px, 80vw)' }}>
      <Row>
        <PanelLabel>{subscription.name}</PanelLabel>
        <Detail>
          {channel && channelPageUrl(subscription.url) ? (
            <a
              href={channelPageUrl(subscription.url)}
              target="_blank"
              rel="noreferrer"
            >
              Open channel on YouTube
            </a>
          ) : (
            subscription.url && (
              <a href={subscription.url} target="_blank" rel="noreferrer">
                {subscription.url}
              </a>
            )
          )}
          {subscription.lastFetchedAt && (
            <div>Checked {timeAgo(subscription.lastFetchedAt)}</div>
          )}
          {subscription.failedAt && (
            <div>Last check failed {timeAgo(subscription.failedAt)}</div>
          )}
        </Detail>
      </Row>
      {channel ? (
        <Row>
          <Toggle>
            Include Shorts
            <Switch
              label="Include Shorts"
              checked={includeShorts}
              onChange={changeShorts}
            />
          </Toggle>
          <Detail>
            Shorts are vertical clips under a minute. New ones appear from the
            next check.
          </Detail>
        </Row>
      ) : (
        <Row>
          <PanelLabel>Fetch full article</PanelLabel>
          <SegmentedControl
            label="Fetch full article"
            value={fullText}
            onChange={changeFullText}
            options={[
              { value: 'ALWAYS', label: 'Always' },
              { value: 'WHEN_EMPTY', label: 'If short' },
              { value: 'NEVER', label: 'Never' },
            ]}
          />
          <Detail>
            Stash can load the whole article from the site when the feed only
            carries a summary.
          </Detail>
        </Row>
      )}
      <Row>
        <Danger
          data-confirm={confirming}
          onClick={unsubscribe}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? 'Click again to unsubscribe' : 'Unsubscribe'}
        </Danger>
      </Row>
    </div>
  )
}
