import { fetchEndpoint } from '../../appConfig'
import { requestHeaders } from '../networkHelpers'

export type YouTubeStatus = {
  configured: boolean
  connected: boolean
  channelTitle?: string
  lastSyncedAt?: string
  importedChannels: number
  syncing: boolean
  authorizing: boolean
  error?: string
}
export async function youtubeRequest<T>(
  path: string,
  post = false
): Promise<T> {
  const result = await fetch(
    `${fetchEndpoint.replace(/\/$/, '')}/youtube/${path}`,
    {
      method: post ? 'POST' : 'GET',
      credentials: 'include',
      headers: {
        ...requestHeaders(),
        ...(post ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(post ? { body: '{}' } : {}),
    }
  )
  const data = (await result.json()) as T & { error?: string }
  if (!result.ok)
    throw new Error(data.error || 'YouTube could not be reached. Try again.')
  return data
}
