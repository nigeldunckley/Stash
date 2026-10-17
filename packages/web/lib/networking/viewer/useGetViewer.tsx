import { useQuery } from '@tanstack/react-query'
import { gqlFetcher } from '../networkHelpers'
import { featureFragment } from '../fragments/featureFragment'
import { gql } from 'graphql-request'
import { UserBasicData } from '../queries/useGetViewerQuery'

// Thrown only when the API answered and said nobody is signed in. Any other
// failure (the server restarting after an update, a dropped connection) is
// retried instead, so a blip never signs you out.
export const SIGNED_OUT = 'no user found'

export const isSignedOutError = (error: unknown): boolean =>
  error instanceof Error && error.message === SIGNED_OUT

export function useGetViewer() {
  return useQuery({
    queryKey: ['viewer'],
    staleTime: Infinity,
    queryFn: async () => {
      const response = (await gqlFetcher(GQL_GET_VIEWER)) as ViewerData
      if (!response.me) {
        throw new Error(SIGNED_OUT)
      }
      return response.me
    },
    retry: (_failureCount, error) => !isSignedOutError(error),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
  })
}

// Asks the API directly (no cache) whether this browser is signed in.
// Undefined means the server couldn't be reached, so we don't know.
export async function fetchIsSignedIn(): Promise<boolean | undefined> {
  try {
    const response = (await gqlFetcher(GQL_SIGNED_IN, undefined, false)) as {
      me?: { id: string }
    }
    return !!response.me
  } catch {
    return undefined
  }
}

const GQL_SIGNED_IN = gql`
  query SignedIn {
    me {
      id
    }
  }
`

type ViewerData = {
  me?: UserBasicData
}

const GQL_GET_VIEWER = gql`
  query Viewer {
    me {
      id
      name
      isFullUser
      profile {
        id
        username
        pictureUrl
        bio
      }
      email
      source
      intercomHash
      featureList {
        ...FeatureFields
      }
    }
  }
  ${featureFragment}
`
