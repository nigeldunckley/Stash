import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { BlogrollSite } from '../utils/feedDiscovery'

// How far Stash trusts one of your feeds (or your saves, or the writers you
// read) to lead somewhere good. It rises when you keep what it led to and
// falls when you drop it.
@Entity({ name: 'feed_suggestion_guides' })
export class FeedSuggestionGuide {
  @PrimaryColumn('uuid')
  userId!: string

  @PrimaryColumn('text')
  guide!: string

  @Column('real', { default: 1 })
  weight!: number

  // The sites the feed's blogroll lists; empty when it has none.
  @Column('jsonb', { nullable: true })
  blogroll?: BlogrollSite[] | null

  @Column('timestamptz', { nullable: true })
  blogrollCheckedAt?: Date | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
