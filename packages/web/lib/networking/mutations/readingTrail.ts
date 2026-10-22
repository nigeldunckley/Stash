import { gql } from 'graphql-request'
import { gqlFetcher } from '../networkHelpers'

// The parts of an article you've actually read, kept with the article so
// the margin map shows the same trail on every device.

type TrailResult = {
  trail?: string
  errorCodes?: string[]
}

export async function readingTrailQuery(
  id: string
): Promise<string | undefined> {
  const query = gql`
    query ReadingTrail($id: ID!) {
      readingTrail(id: $id) {
        ... on ReadingTrailSuccess {
          trail
        }
        ... on ReadingTrailError {
          errorCodes
        }
      }
    }
  `
  const data = (await gqlFetcher(query, { id })) as {
    readingTrail?: TrailResult
  }
  return data.readingTrail?.trail
}

export async function saveReadingTrailMutation(input: {
  id: string
  trail: string
}): Promise<boolean> {
  const mutation = gql`
    mutation SaveReadingTrail($input: SaveReadingTrailInput!) {
      saveReadingTrail(input: $input) {
        ... on ReadingTrailSuccess {
          trail
        }
        ... on ReadingTrailError {
          errorCodes
        }
      }
    }
  `
  const data = (await gqlFetcher(mutation, { input })) as {
    saveReadingTrail?: TrailResult
  }
  return data.saveReadingTrail?.trail !== undefined
}
