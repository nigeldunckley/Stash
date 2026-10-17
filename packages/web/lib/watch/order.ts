// The order of Watch later. Videos are queued oldest saved first; dragging
// one (or "Play next") pins it ahead of the rest. The pinned order is kept
// with your account so the Mac and iPhone play the same queue.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { LibraryItemNode } from '../networking/library_items/useLibraryItems'
import { readWatchList, updateWatchList } from './collections'

const KEY = ['watch-order']
const KEEP = 200

export function useWatchLaterOrder(items: LibraryItemNode[]) {
  const queryClient = useQueryClient()
  const { data: order } = useQuery({
    queryKey: KEY,
    queryFn: () => readWatchList('order'),
    staleTime: 60 * 1000,
  })

  // Pinned videos first, in their order, then the rest as they came.
  const sorted = useMemo(() => {
    const rank = new Map((order ?? []).map((id, index) => [id, index]))
    return [...items].sort((a, b) => {
      const ra = rank.get(a.id)
      const rb = rank.get(b.id)
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return 0
    })
  }, [items, order])

  // Puts a video before another (or last with none), pinning the whole
  // queue as it now stands.
  const move = useCallback(
    async (id: string, beforeId: string | null) => {
      const ids = sorted.map((item) => item.id).filter((x) => x != id)
      const at = beforeId ? ids.indexOf(beforeId) : -1
      ids.splice(at < 0 ? ids.length : at, 0, id)
      queryClient.setQueryData(KEY, ids)
      try {
        await updateWatchList('order', () => ids.slice(0, KEEP))
      } catch {
        queryClient.invalidateQueries({ queryKey: KEY })
      }
    },
    [sorted, queryClient]
  )

  return { sorted, move }
}
