import Link from 'next/link'
import { styled } from '../../tokens/stitches.config'
import { useDeveloperMode } from '../../../lib/hooks/useDeveloperMode'
import { useServerVersion } from '../../../lib/networking/useServerVersion'
import {
  describeCommit,
  lastServerUpdate,
  updatedAgo,
} from '../../../lib/serverVersion'

const Chip = styled(Link, {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '8px 10px 2px',
  padding: '8px 10px',
  border: '1px solid $stLine',
  borderRadius: '8px',
  fontFamily: '$mono',
  fontSize: '$micro',
  lineHeight: 1.3,
  color: '$stMuted',
  textDecoration: 'none',
  '&:hover': { color: '$stInk', borderColor: '$stLineStrong' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '& > span:first-of-type': { flex: 1, minWidth: 0 },
  '& b': { fontWeight: 500, color: '$stInk' },
})

const Dot = styled('i', {
  flex: 'none',
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: '$stLineStrong',
  variants: {
    tone: {
      ok: { background: '$stInk2' },
      failed: { background: '$stAccent' },
    },
  },
})

// With developer mode on (Settings > Developer), the sidebar shows when the
// server last took a new version and which pull request the web app is on.
export function ServerVersionChip(): JSX.Element | null {
  const [developerMode] = useDeveloperMode()
  const { data, isError } = useServerVersion(developerMode)
  if (!developerMode) {
    return null
  }
  const updated = lastServerUpdate(data)
  const failed = isError || data?.lastCheck?.result == 'failed'
  const { pr } = describeCommit(data?.web)
  return (
    <Chip href="/settings/developer" title="Server version">
      <Dot tone={failed ? 'failed' : data ? 'ok' : undefined} />
      <span>
        {isError ? (
          'Server status unavailable'
        ) : updated ? (
          <>
            Updated <b>{updatedAgo(updated)}</b>
          </>
        ) : (
          'Checking server…'
        )}
      </span>
      {pr && <span>#{pr}</span>}
    </Chip>
  )
}
