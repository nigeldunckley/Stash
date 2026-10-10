import { useQuery } from '@tanstack/react-query'
import { requestHeaders } from './networkHelpers'
import { ServerVersion } from '../serverVersion'

// Re-checked every minute while shown, so a merge going live appears
// without reloading.
export function useServerVersion(enabled: boolean) {
  return useQuery({
    queryKey: ['server-version'],
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<ServerVersion> => {
      const response = await fetch('/_stash/version', {
        headers: requestHeaders(),
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(`Version check failed (${response.status})`)
      }
      return (await response.json()) as ServerVersion
    },
  })
}
