import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type FeedSuggestionStatus =
  | 'new'
  | 'following'
  | 'trial'
  | 'kept'
  | 'dismissed'
  // a site with no feed Stash could find; kept so it isn't checked nightly
  | 'nofeed'

// One of your feeds (or your saves, or a writer) that led to a suggestion.
export type FeedSuggestionReason = {
  kind: 'link' | 'save' | 'writer' | 'neighbour' | 'similar'
  // the feed URL of the guide, 'saves' or the writer's name
  guide: string
  guideName: string
  count: number
  // an article that shows the reason, e.g. one that linked here
  title?: string
}

export type FeedSuggestionPost = {
  title: string
  url: string
  image?: string
  summary?: string
  publishedAt?: string
  minutes?: number
}

@Entity({ name: 'feed_suggestions' })
export class FeedSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  userId!: string

  @Column('text')
  site!: string

  @Column('text')
  siteUrl!: string

  @Column('text', { nullable: true })
  feedUrl?: string | null

  @Column('text', { default: 'rss' })
  kind!: string

  @Column('text', { nullable: true })
  title?: string | null

  @Column('text', { nullable: true })
  description?: string | null

  @Column('text', { nullable: true })
  icon?: string | null

  @Column('text', { nullable: true })
  author?: string | null

  @Column('real', { nullable: true })
  postsPerWeek?: number | null

  @Column('timestamptz', { nullable: true })
  lastPostAt?: Date | null

  @Column('jsonb', { default: [] })
  latest!: FeedSuggestionPost[]

  @Column('text', { array: true, default: [] })
  outHosts!: string[]

  @Column('jsonb', { default: {} })
  signals!: Record<string, number>

  @Column('jsonb', { default: [] })
  reasons!: FeedSuggestionReason[]

  @Column('real', { default: 0 })
  score!: number

  @Column('text', { default: 'new' })
  status!: FeedSuggestionStatus

  @Column('uuid', { nullable: true })
  subscriptionId?: string | null

  @Column('timestamptz', { nullable: true })
  trialEndsAt?: Date | null

  @Column('timestamptz', { nullable: true })
  checkedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
