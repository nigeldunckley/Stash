import axios from 'axios'
import { parseHTML } from 'linkedom'
import { Brackets, In } from 'typeorm'
import {
  DEFAULT_SUBSCRIPTION_FOLDER,
  FetchContentType,
  Subscription,
  SubscriptionStatus,
  SubscriptionType,
} from '../../entity/subscription'
import { env } from '../../env'
import {
  ErrorCode,
  FeedEdge,
  FeedsError,
  FeedsErrorCode,
  FeedsSuccess,
  MutationSubscribeArgs,
  MutationUnsubscribeArgs,
  MutationUpdateSubscriptionArgs,
  QueryFeedsArgs,
  QueryScanFeedsArgs,
  QuerySubscriptionArgs,
  QuerySubscriptionsArgs,
  ScanFeedsError,
  ScanFeedsErrorCode,
  ScanFeedsSuccess,
  SortBy,
  SortOrder,
  SubscribeError,
  SubscribeErrorCode,
  SubscribeSuccess,
  SubscriptionError,
  SubscriptionsError,
  SubscriptionsErrorCode,
  SubscriptionsSuccess,
  SubscriptionSuccess,
  UnsubscribeError,
  UnsubscribeErrorCode,
  UnsubscribeSuccess,
  UpdateSubscriptionError,
  UpdateSubscriptionErrorCode,
  UpdateSubscriptionSuccess,
  QueryYoutubeChannelArgs,
  YouTubeChannelError,
  YouTubeChannelErrorCode,
  YouTubeChannelSuccess,
  YouTubeChannelSearchError,
  YouTubeChannelSearchSuccess,
  QueryYoutubeChannelSearchArgs,
} from '../../generated/graphql'
import { getRepository } from '../../repository'
import { feedRepository } from '../../repository/feed'
import { validateUrl } from '../../services/create_page_save_request'
import { findLabelById } from '../../services/labels'
import { findSubscriptionById, unsubscribe } from '../../services/subscriptions'
import { updateSubscription } from '../../services/update_subscription'
import { Merge } from '../../util'
import { analytics } from '../../utils/analytics'
import { enqueueRssFeedFetch } from '../../utils/createTask'
import { authorized } from '../../utils/gql-utils'
import { getAbsoluteUrl, keysToCamelCase } from '../../utils/helpers'
import { Feed, parseFeed, parseOpml, rssParserConfig } from '../../utils/parser'
import {
  channelIdFromFeedUrl,
  isYouTubeUrl,
  resolveYouTubeChannel,
  searchYouTubeChannels,
  YouTubeUnavailableError,
} from '../../utils/youtubeChannel'
import { isArray } from 'lodash'

type PartialSubscription = Omit<Subscription, 'newsletterEmail'>

// A YouTube channel described from YouTube itself, for when its feed can't be
// read.
const youtubeChannelFeed = async (feedUrl: string): Promise<Feed | null> => {
  const channel = await resolveYouTubeChannel(feedUrl, 0).catch(() => undefined)
  return channel
    ? {
        url: feedUrl,
        title: channel.title,
        type: 'rss',
        thumbnail: channel.avatar,
      }
    : null
}

export type SubscriptionsSuccessPartial = Merge<
  SubscriptionsSuccess,
  { subscriptions: PartialSubscription[] }
>
export const subscriptionsResolver = authorized<
  SubscriptionsSuccessPartial,
  SubscriptionsError,
  QuerySubscriptionsArgs
>(async (_obj, { sort, type }, { uid, log }) => {
  try {
    const sortBy = sort?.by === SortBy.UpdatedTime ? 'refreshedAt' : 'createdAt'
    const sortOrder = sort?.order === SortOrder.Ascending ? 'ASC' : 'DESC'

    const queryBuilder = getRepository(Subscription)
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.newsletterEmail', 'newsletterEmail')
      .where({
        user: { id: uid },
      })

    if (type && type == SubscriptionType.Newsletter) {
      queryBuilder.andWhere({
        type,
        status: SubscriptionStatus.Active,
      })
    } else if (type && type == SubscriptionType.Rss) {
      queryBuilder.andWhere({
        type,
      })
    } else {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where({
            type: SubscriptionType.Newsletter,
            status: SubscriptionStatus.Active,
          }).orWhere({
            type: SubscriptionType.Rss,
          })
        })
      )
    }

    const subscriptions = await queryBuilder
      .orderBy('subscription.status', 'ASC')
      .addOrderBy(`subscription.${sortBy}`, sortOrder, 'NULLS LAST')
      .getMany()

    return {
      subscriptions,
    }
  } catch (error) {
    log.error(error)
    return {
      errorCodes: [SubscriptionsErrorCode.BadRequest],
    }
  }
})

export type UnsubscribeSuccessPartial = Merge<
  UnsubscribeSuccess,
  { subscription: PartialSubscription }
>
export const unsubscribeResolver = authorized<
  UnsubscribeSuccessPartial,
  UnsubscribeError,
  MutationUnsubscribeArgs
>(async (_, { name, subscriptionId }, { uid, log }) => {
  log.info('unsubscribeResolver')

  try {
    const queryBuilder = getRepository(Subscription)
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.newsletterEmail', 'newsletterEmail')
      .where({ user: { id: uid } })

    if (subscriptionId) {
      // if subscriptionId is provided, ignore name
      queryBuilder.andWhere({ id: subscriptionId })
    } else {
      // if subscriptionId is not provided, use name for old clients
      queryBuilder.andWhere({ name })
    }

    const subscription = await queryBuilder.getOne()

    if (!subscription) {
      return {
        errorCodes: [UnsubscribeErrorCode.NotFound],
      }
    }

    if (
      subscription.type === SubscriptionType.Newsletter &&
      !subscription.unsubscribeMailTo &&
      !subscription.unsubscribeHttpUrl
    ) {
      log.info('No unsubscribe method found for newsletter subscription')
    }

    await unsubscribe(subscription)

    analytics.capture({
      distinctId: uid,
      event: 'unsubscribed',
      properties: {
        name,
        env: env.server.apiEnv,
      },
    })

    return {
      subscription,
    }
  } catch (error) {
    log.error('failed to unsubscribe', error)
    return {
      errorCodes: [UnsubscribeErrorCode.BadRequest],
    }
  }
})

export type SubscribeSuccessPartial = Merge<
  SubscribeSuccess,
  { subscriptions: PartialSubscription[] }
>
// A Watch collection is one of the user's labels. Anything else is ignored;
// an empty string (take the channel out of its collection) passes through.
const ownCollectionId = async (
  uid: string,
  collectionId: string | null | undefined
) => {
  if (!collectionId) {
    return collectionId
  }
  const label = await findLabelById(collectionId, uid)
  return label ? label.id : undefined
}

export const subscribeResolver = authorized<
  SubscribeSuccessPartial,
  SubscribeError,
  MutationSubscribeArgs
>(async (_, { input }, { uid, log }) => {
  try {
    analytics.capture({
      distinctId: uid,
      event: 'subscribed',
      properties: {
        ...input,
        env: env.server.apiEnv,
      },
    })
    // use user provided url
    const feedUrl = input.url
    try {
      validateUrl(feedUrl)
    } catch (error) {
      log.error('invalid feedUrl', { feedUrl, error })

      return {
        errorCodes: [SubscribeErrorCode.BadRequest],
      }
    }

    // validate rss feed. A YouTube channel can be followed even when its feed
    // is briefly unavailable, as long as YouTube knows the channel.
    const feed =
      (await parseFeed(feedUrl)) ||
      (channelIdFromFeedUrl(feedUrl) ? await youtubeChannelFeed(feedUrl) : null)
    if (!feed) {
      return {
        errorCodes: [SubscribeErrorCode.NotFound],
      }
    }

    // A YouTube feed has no picture of its own, so use the channel's avatar.
    if (channelIdFromFeedUrl(feedUrl) && !feed.thumbnail) {
      const channel = await resolveYouTubeChannel(feedUrl, 0).catch(
        () => undefined
      )
      feed.thumbnail = channel?.avatar
      feed.title = channel?.title || feed.title
    }

    // find existing subscription
    const existingSubscription = await getRepository(Subscription).findOneBy({
      url: In([feedUrl, input.url]), // check both user provided url and parsed url
      user: { id: uid },
      type: SubscriptionType.Rss,
    })
    if (existingSubscription) {
      if (existingSubscription.status === SubscriptionStatus.Active) {
        return {
          errorCodes: [SubscribeErrorCode.AlreadySubscribed],
        }
      }

      // re-subscribe
      const updatedSubscription = await getRepository(Subscription).save({
        ...existingSubscription,
        fetchContentType: input.fetchContentType
          ? (input.fetchContentType as FetchContentType)
          : existingSubscription.fetchContentType,
        folder: input.folder ?? existingSubscription.folder,
        isPrivate: input.isPrivate,
        includeShorts:
          input.includeShorts ?? existingSubscription.includeShorts,
        collectionId:
          (await ownCollectionId(uid, input.collectionId)) ||
          existingSubscription.collectionId,
        status: SubscriptionStatus.Active,
      })

      // create a cloud task to fetch rss feed item for resub subscription
      await enqueueRssFeedFetch({
        userIds: [uid],
        url: feedUrl,
        subscriptionIds: [updatedSubscription.id],
        scheduledDates: [new Date()], // fetch immediately
        mostRecentItemDates: [updatedSubscription.mostRecentItemDate || null],
        checksums: [updatedSubscription.lastFetchedChecksum || null],
        fetchContentTypes: [updatedSubscription.fetchContentType],
        folders: [updatedSubscription.folder || DEFAULT_SUBSCRIPTION_FOLDER],
        includeShorts: [updatedSubscription.includeShorts],
      })

      return {
        subscriptions: [updatedSubscription],
      }
    }

    // create new rss subscription
    const MAX_RSS_SUBSCRIPTIONS = env.subscription.feed.max

    // limit number of rss subscriptions to max
    const results = (await getRepository(Subscription).query(
      `insert into omnivore.subscriptions (name, url, description, type, user_id, icon, is_private, fetch_content_type, folder, include_shorts, collection_id) 
          select $1, $2, $3, $4, $5, $6, $7, $8, $9, $11, $12 from omnivore.subscriptions 
          where user_id = $5 and type = 'RSS' and status = 'ACTIVE' 
          having count(*) < $10
          returning *;`,
      [
        feed.title,
        feedUrl,
        feed.description,
        SubscriptionType.Rss,
        uid,
        feed.thumbnail,
        input.isPrivate,
        input.fetchContentType ?? FetchContentType.Always,
        input.folder ?? 'following',
        MAX_RSS_SUBSCRIPTIONS,
        input.includeShorts ?? false,
        (await ownCollectionId(uid, input.collectionId)) || null,
      ]
    )) as any[]

    if (results.length === 0) {
      return {
        errorCodes: [SubscribeErrorCode.ExceededMaxSubscriptions],
      }
    }

    // convert to camel case
    const newSubscription = keysToCamelCase(results[0]) as Subscription

    // create a cloud task to fetch rss feed item for the new subscription
    await enqueueRssFeedFetch({
      userIds: [uid],
      url: feedUrl,
      subscriptionIds: [newSubscription.id],
      scheduledDates: [new Date()], // fetch immediately
      mostRecentItemDates: [null],
      checksums: [null],
      fetchContentTypes: [newSubscription.fetchContentType],
      folders: [newSubscription.folder || DEFAULT_SUBSCRIPTION_FOLDER],
      includeShorts: [newSubscription.includeShorts],
    })

    return {
      subscriptions: [newSubscription],
    }
  } catch (error) {
    log.error('failed to subscribe', error)
    if (error instanceof Error && error.message === 'Status code 404') {
      return {
        errorCodes: [SubscribeErrorCode.NotFound],
      }
    }
    return {
      errorCodes: [SubscribeErrorCode.BadRequest],
    }
  }
})

export type UpdateSubscriptionSuccessPartial = Merge<
  UpdateSubscriptionSuccess,
  { subscription: PartialSubscription }
>
export const updateSubscriptionResolver = authorized<
  UpdateSubscriptionSuccessPartial,
  UpdateSubscriptionError,
  MutationUpdateSubscriptionArgs
>(async (_, { input }, { uid, log }) => {
  try {
    analytics.capture({
      distinctId: uid,
      event: 'update_subscription',
      properties: {
        ...input,
        env: env.server.apiEnv,
      },
    })

    const updatedSubscription = await updateSubscription(uid, input.id, {
      ...input,
      collectionId: await ownCollectionId(uid, input.collectionId),
    })
    return {
      subscription: updatedSubscription,
    }
  } catch (error) {
    log.error('failed to update subscription', error)
    return {
      errorCodes: [UpdateSubscriptionErrorCode.BadRequest],
    }
  }
})

export const feedsResolver = authorized<
  FeedsSuccess,
  FeedsError,
  QueryFeedsArgs
>(async (_, { input }, { log }) => {
  try {
    const startCursor = input.after || ''
    const start =
      startCursor && !isNaN(Number(startCursor)) ? Number(startCursor) : 0
    const first = Math.min(input.first || 10, 100) // cap at 100

    const { feeds, count } = await feedRepository.searchFeeds(
      input.query || '',
      first + 1, // fetch one extra to check if there is a next page
      start,
      input.sort?.by,
      input.sort?.order || undefined
    )

    const hasNextPage = feeds.length > first
    const endCursor = String(start + feeds.length - (hasNextPage ? 1 : 0))

    if (hasNextPage) {
      // remove an extra if exists
      feeds.pop()
    }

    const edges: FeedEdge[] = feeds.map((feed) => ({
      node: feed,
      cursor: endCursor,
    }))

    return {
      __typename: 'FeedsSuccess',
      edges,
      pageInfo: {
        hasPreviousPage: start > 0,
        hasNextPage,
        startCursor,
        endCursor,
        totalCount: count,
      },
    }
  } catch (error) {
    log.error('Error fetching feeds', error)

    return {
      errorCodes: [FeedsErrorCode.BadRequest],
    }
  }
})

export const scanFeedsResolver = authorized<
  ScanFeedsSuccess,
  ScanFeedsError,
  QueryScanFeedsArgs
>(async (_, { input: { opml, url } }, { log, uid }) => {
  analytics.capture({
    distinctId: uid,
    event: 'scan_feeds',
    properties: {
      opml,
      url,
    },
  })

  if (opml) {
    // parse opml
    const feeds = parseOpml(opml)
    if (!feeds) {
      return {
        errorCodes: [ScanFeedsErrorCode.BadRequest],
      }
    }

    return {
      feeds: feeds.map((feed) => ({
        url: feed.url,
        title: feed.title,
        type: feed.type || 'rss',
      })),
    }
  }

  if (!url) {
    log.error('Missing opml and url')

    return {
      errorCodes: [ScanFeedsErrorCode.BadRequest],
    }
  }

  // A YouTube channel or video leads to the channel's feed.
  if (isYouTubeUrl(url)) {
    const channel = await resolveYouTubeChannel(url, 0).catch(() => undefined)
    return {
      feeds: channel
        ? [{ url: channel.feedUrl, title: channel.title, type: 'rss' }]
        : [],
    }
  }

  // Ensure that we are not running a http request against local/private IPs.
  try {
    validateUrl(url)
  } catch (e) {
    return {
      errorCodes: [ScanFeedsErrorCode.BadRequest],
    }
  }

  try {
    const response = await axios.get(url, rssParserConfig())
    const content = response.data as string
    // check if the content is html or xml
    const contentType = response.headers['Content-Type']
    const isHtml = isArray(contentType)
      ? contentType.includes('text/html')
      : contentType === 'text/html'

    if (isHtml) {
      // this is an html page, parse rss feed links
      const dom = parseHTML(content).document
      // type is application/rss+xml or application/atom+xml
      const links = dom.querySelectorAll(
        'link[type="application/rss+xml"], link[type="application/atom+xml"]'
      )

      const feeds = Array.from(links)
        .map((link) => {
          const href = link.getAttribute('href') || ''
          const feedUrl = getAbsoluteUrl(href, url)

          return {
            url: feedUrl,
            title: link.getAttribute('title') || '',
            type: 'rss',
          }
        })
        .filter((feed) => feed.url)

      return {
        feeds,
      }
    }

    // this is the url to an RSS feed
    const feed = await parseFeed(url, content)
    if (!feed) {
      log.error('Failed to parse RSS feed')
      return {
        feeds: [],
      }
    }

    return {
      feeds: [feed],
    }
  } catch (error) {
    log.error('Error scanning URL', error)

    return {
      errorCodes: [ScanFeedsErrorCode.BadRequest],
    }
  }
})

// Looks up a YouTube channel from a channel link, @handle or video link, with
// its latest uploads, so it can be previewed before subscribing.
export const youtubeChannelResolver = authorized<
  YouTubeChannelSuccess,
  YouTubeChannelError,
  QueryYoutubeChannelArgs
>(async (_, { url }) => {
  if (!isYouTubeUrl(url)) {
    return { errorCodes: [YouTubeChannelErrorCode.BadRequest] }
  }
  try {
    const channel = await resolveYouTubeChannel(url)
    if (!channel) {
      return { errorCodes: [YouTubeChannelErrorCode.NotFound] }
    }
    return { channel }
  } catch (error) {
    if (error instanceof YouTubeUnavailableError) {
      return { errorCodes: [YouTubeChannelErrorCode.Unavailable] }
    }
    throw error
  }
})

// Finds YouTube channels by name, for subscribing without a link.
export const youtubeChannelSearchResolver = authorized<
  YouTubeChannelSearchSuccess,
  YouTubeChannelSearchError,
  QueryYoutubeChannelSearchArgs
>(async (_, { query }) => {
  const trimmed = query.trim()
  if (trimmed.length < 2 || trimmed.length > 100) {
    return { errorCodes: [YouTubeChannelErrorCode.BadRequest] }
  }
  try {
    return { channels: await searchYouTubeChannels(trimmed) }
  } catch (error) {
    if (error instanceof YouTubeUnavailableError) {
      return { errorCodes: [YouTubeChannelErrorCode.Unavailable] }
    }
    throw error
  }
})

export const subscriptionResolver = authorized<
  Merge<SubscriptionSuccess, { subscription: Subscription }>,
  SubscriptionError,
  QuerySubscriptionArgs
>(async (_, { id }, { uid, log }) => {
  if (!id) {
    log.error('Missing subscription id')

    return {
      errorCodes: [ErrorCode.BadRequest],
    }
  }

  const subscription = await findSubscriptionById(uid, id)
  if (!subscription) {
    log.error('Subscription not found', { id })

    return {
      errorCodes: [ErrorCode.NotFound],
    }
  }

  return {
    subscription,
  }
})
