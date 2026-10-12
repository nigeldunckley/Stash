import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

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

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
