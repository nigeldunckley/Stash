import { LibraryItem } from '../../entity/library_item'
import {
  MutationSaveReadingTrailArgs,
  QueryReadingTrailArgs,
  ReadingTrailError,
  ReadingTrailErrorCode,
  ReadingTrailSuccess,
} from '../../generated/graphql'
import { authTrx } from '../../repository'
import { authorized } from '../../utils/gql-utils'
import { formatTrail, mergeTrail, parseTrail } from '../../utils/readingTrail'

const findTrail = (id: string, uid: string) =>
  authTrx(
    (tx) =>
      tx
        .getRepository(LibraryItem)
        .createQueryBuilder('item')
        .select(['item.id', 'item.readingTrail'])
        .where('item.id = :id AND item.user_id = :uid', { id, uid })
        .getOne(),
    { uid }
  )

export const readingTrailResolver = authorized<
  ReadingTrailSuccess,
  ReadingTrailError,
  QueryReadingTrailArgs
>(async (_, { id }, { uid }) => {
  const item = await findTrail(id, uid)
  if (!item) return { errorCodes: [ReadingTrailErrorCode.NotFound] }
  return { trail: formatTrail(parseTrail(item.readingTrail) ?? []) }
})

export const saveReadingTrailResolver = authorized<
  ReadingTrailSuccess,
  ReadingTrailError,
  MutationSaveReadingTrailArgs
>(async (_, { input: { id, trail } }, { uid }) => {
  const incoming = parseTrail(trail)
  if (!incoming) return { errorCodes: [ReadingTrailErrorCode.BadData] }
  const item = await findTrail(id, uid)
  if (!item) return { errorCodes: [ReadingTrailErrorCode.NotFound] }
  const merged = formatTrail(
    mergeTrail(parseTrail(item.readingTrail) ?? [], incoming)
  )
  if (merged != item.readingTrail) {
    await authTrx(
      (tx) =>
        tx.getRepository(LibraryItem).update(id, { readingTrail: merged }),
      { uid }
    )
  }
  return { trail: merged }
})
