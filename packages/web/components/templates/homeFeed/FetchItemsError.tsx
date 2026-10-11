import { WarningCircle } from '@phosphor-icons/react'
import { EmptyState } from '../../elements/stash/EmptyState'

export const FetchItemsError = (): JSX.Element => {
  return (
    <EmptyState
      tone="error"
      icon={<WarningCircle size={24} />}
      title="Couldn’t load your items"
      action={{ label: 'Try again', onClick: () => window.location.reload() }}
    >
      Stash couldn’t reach your server. Check your connection and try again.
    </EmptyState>
  )
}
