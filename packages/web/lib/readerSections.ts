// The reader's sections, as the margin map finds them, shared with the
// reader's top bar (and Stash's own app) through two window events.

// Sent by the map whenever the sections or the one you're in change.
export const SECTIONS_EVENT = 'stash:sections'
// Sent to the map to open its contents (the sheet on a phone).
export const CONTENTS_EVENT = 'stash:contents'

export type SectionsDetail = {
  count: number
  current?: { number: number; label: string }
  // Where each section starts, as a fraction of the page's scroll.
  marks: number[]
}

export const sectionNumber = (number: number): string =>
  number < 10 ? `0${number}` : `${number}`

export const openContents = (): void => {
  window.dispatchEvent(new Event(CONTENTS_EVENT))
}

const ARTICLE = /^(the|a|an)$/i

const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Short names for the map's labels. Words a heading shares at its start
// with another heading go first ("Using the keyboard" and "Using the
// trackpad" become "keyboard" and "trackpad"), then a leading "The".
// Always leaves at least one word.
export const shortNames = (titles: string[]): string[] => {
  const split = titles.map((title) => title.trim().split(/\s+/).filter(Boolean))
  return split.map((words, index) => {
    let start = 0
    split.forEach((other, otherIndex) => {
      if (otherIndex == index) return
      let shared = 0
      while (
        shared < words.length - 1 &&
        shared < other.length &&
        bare(words[shared]) == bare(other[shared])
      ) {
        shared++
      }
      start = Math.max(start, shared)
    })
    let rest = words.slice(start)
    if (rest.length > 1 && ARTICLE.test(rest[0])) rest = rest.slice(1)
    return rest.join(' ').replace(/[:;,.]+$/, '')
  })
}
