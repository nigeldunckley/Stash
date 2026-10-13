import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { EditionState, loadEditionState, updateEditionState } from './store'
import { issueIsOut } from './weekly'

// The Edition's settings and stored issues, read without ever making one.
// Navigation uses this to show The Edition only while an issue is out.
export const EDITION_STATE_KEY = 'edition-state'

export function useEditionState() {
  return useQuery({
    queryKey: [EDITION_STATE_KEY],
    queryFn: loadEditionState,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

// Re-checks the clock each minute, so the issue appears at 07:00 and leaves
// at the end of Sunday without a reload.
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export type EditionStatus = {
  // An issue is out and not marked read.
  out: boolean
  // The date of the issue that is out (or last came out).
  date?: string
  // Out and not opened yet.
  fresh: boolean
  state?: EditionState
}

export function useEditionStatus(): EditionStatus {
  const { data: state } = useEditionState()
  const now = useMinute()
  if (!state) return { out: false, fresh: false }
  const { out, date } = issueIsOut(now, state, state.read)
  return { out, date, fresh: out && !state.opened.includes(date), state }
}

// Saves a change to the settings or stored issues and refreshes everything
// that reads them.
export function useUpdateEdition() {
  const queryClient = useQueryClient()
  return useCallback(
    async (change: (state: EditionState) => Partial<EditionState>) => {
      const next = await updateEditionState((latest) => ({
        ...latest,
        ...change(latest),
      }))
      queryClient.setQueryData([EDITION_STATE_KEY], next)
      queryClient.setQueryData(['edition'], (current?: EditionState) =>
        current ? next : current
      )
      return next
    },
    [queryClient]
  )
}

export const withDate = (dates: string[], date: string): string[] =>
  dates.includes(date) ? dates : [...dates, date]
