import { Check, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import {
  useFollowedChannels,
  useFollowVideoChannel,
} from '../../../lib/watch/channels'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

const Button = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '26px',
  padding: '0 10px',
  marginBottom: '10px',
  borderRadius: '$sm',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  cursor: 'pointer',
  background: '$stAccent',
  color: '$stOnAccent',
  transition: `filter ${motion.fast}`,
  '&:hover': { filter: 'brightness(1.05)' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': {
    cursor: 'default',
    background: '$stSunken',
    color: '$stMuted',
    filter: 'none',
  },
})

// A Subscribe button for a video whose channel isn't followed yet, such as
// one saved from a link. Nothing shows once it is.
export function SubscribeChannel(props: {
  item: LibraryItemNode
  channelName: string
}): JSX.Element | null {
  const followed = useFollowedChannels()
  const followVideo = useFollowVideoChannel()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const { item } = props
  const following = item.subscription
    ? followed.hasFeed(item.subscription)
    : followed.hasName(item.author) || followed.hasName(props.channelName)
  if (!followed.ready || (following && state != 'done')) {
    return null
  }
  return (
    <Button
      disabled={state != 'idle'}
      onClick={async () => {
        setState('busy')
        const result = await followVideo(item.originalArticleUrl || item.url)
        setState(result == 'failed' ? 'idle' : 'done')
      }}
    >
      {state == 'done' ? (
        <Check size={12} weight="bold" />
      ) : (
        <Plus size={12} weight="bold" />
      )}
      {state == 'done'
        ? `Following ${props.channelName}`
        : `Subscribe to ${props.channelName}`}
    </Button>
  )
}
