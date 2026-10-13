import { Action } from 'kbar'
import type { KeyboardCommand } from './useKeyboardShortcuts'
import type { NextRouter } from 'next/router'

export function navigationCommands(router: NextRouter | undefined): Action[] {
  return [
    {
      id: 'nav-home',
      section: { name: 'Go to', priority: 0 },
      name: 'Home',
      shortcut: ['g', 'h'],
      keywords: 'go home new feeds up next',
      perform: () => {
        router?.push(`/home`)
      },
    },
    {
      id: 'nav-edition',
      section: { name: 'Go to', priority: 0 },
      name: 'The Edition',
      shortcut: ['g', 'e'],
      keywords: "edition weekly paper issue last week's edition",
      perform: () => {
        router?.push(`/edition`)
      },
    },
    {
      id: 'nav-library',
      section: { name: 'Go to', priority: 0 },
      name: 'Library',
      shortcut: ['g', 'l'],
      keywords: 'go library',
      perform: () => {
        router?.push(`/library`)
      },
    },
    {
      id: 'nav-subscriptions',
      section: { name: 'Go to', priority: 0 },
      name: 'Feeds',
      shortcut: ['g', 's'],
      keywords: 'go subscriptions feeds rss',
      perform: () => {
        router?.push(`/subscriptions`)
      },
    },
    {
      id: 'nav-highlights',
      section: { name: 'Go to', priority: 0 },
      name: 'Highlights',
      shortcut: ['g', 'i'],
      keywords: 'go highlights',
      perform: () => {
        router?.push(`/highlights`)
      },
    },
    {
      id: 'nav-archive',
      section: { name: 'Go to', priority: 0 },
      name: 'Archive',
      shortcut: ['g', 'a'],
      keywords: 'go archive',
      perform: () => {
        router?.push(`/archive`)
      },
    },
    {
      id: 'nav-settings',
      section: { name: 'Go to', priority: 0 },
      name: 'Settings',
      keywords: 'go settings preferences account',
      perform: () => {
        router?.push(`/settings/account`)
      },
    },
    {
      id: 'nav-goback',
      section: { name: 'Go to', priority: 0 },
      name: 'Back',
      shortcut: ['g', 'b'],
      keywords: 'go back',
      perform: () => {
        router?.back()
      },
    },
  ]
}

type SearchBarKeyboardAction = 'focusSearchBar' | 'clearSearch'

export function searchBarCommands(
  actionHandler: (action: SearchBarKeyboardAction) => void
): KeyboardCommand[] {
  return [
    {
      shortcutKeys: ['/'],
      actionDescription: 'Focus search bar',
      shortcutKeyDescription: '/',
      callback: () => setTimeout(() => actionHandler('focusSearchBar'), 0),
    },
    {
      shortcutKeys: ['c', 's'],
      actionDescription: 'Clear search bar',
      shortcutKeyDescription: 'c then s',
      callback: () => actionHandler('clearSearch'),
    },
  ]
}

type PrimaryKeyboardAction =
  | 'themeDarker'
  | 'themeLighter'
  | 'toggleShortcutHelpModalDisplay'

// use these on all authenticated pages
export function primaryCommands(
  actionHandler: (action: PrimaryKeyboardAction) => void
): KeyboardCommand[] {
  return [
    {
      shortcutKeys: ['v', 'd'],
      actionDescription: 'Change theme (darker)',
      shortcutKeyDescription: 'v then d',
      callback: () => actionHandler('themeDarker'),
    },
    {
      shortcutKeys: ['v', 'l'],
      actionDescription: 'Change theme (lighter)',
      shortcutKeyDescription: 'v then l',
      callback: () => actionHandler('themeLighter'),
    },
    {
      shortcutKeys: ['?'],
      actionDescription: 'Show keyboard shortcuts',
      shortcutKeyDescription: '?',
      callback: () => actionHandler('toggleShortcutHelpModalDisplay'),
    },
  ]
}

type LibraryListKeyboardAction =
  | 'openArticle'
  | 'selectArticle'
  | 'openOriginalArticle'
  | 'moveFocusToNextListItem'
  | 'moveFocusToPreviousListItem'
  | 'moveFocusToNextRowItem'
  | 'moveFocusToPreviousRowItem'
  | 'archiveItem'
  | 'markItemAsRead'
  | 'markItemAsUnread'
  | 'removeItem'
  | 'sortDescending'
  | 'sortAscending'
  | 'shareItem'
  | 'showAddLinkModal'
  | 'showEditLabelsModal'
  | 'openNotebook'
  | 'beginMultiSelect'
  | 'endMultiSelect'

export function libraryListCommands(
  actionHandler: (action: LibraryListKeyboardAction) => void
): KeyboardCommand[] {
  return [
    {
      shortcutKeys: ['enter'],
      actionDescription: 'Open article',
      shortcutKeyDescription: 'enter/return',
      callback: () => actionHandler('openArticle'),
    },
    {
      shortcutKeys: ['x'],
      actionDescription: 'Select article',
      shortcutKeyDescription: 'x',
      callback: () => {
        actionHandler('selectArticle')
      },
    },
    {
      shortcutKeys: ['o'],
      actionDescription: 'Open original article',
      shortcutKeyDescription: 'o',
      callback: () => actionHandler('openOriginalArticle'),
    },
    {
      shortcutKeys: ['a'],
      actionDescription: 'Open Add Link dialog',
      shortcutKeyDescription: 'a',
      callback: () => actionHandler('showAddLinkModal'),
    },
    {
      shortcutKeys: ['j|arrowright'],
      actionDescription: 'Focus next item in list',
      shortcutKeyDescription: 'j or right arrow',
      callback: () => actionHandler('moveFocusToNextListItem'),
    },
    {
      shortcutKeys: ['k|arrowleft'],
      actionDescription: 'Focus previous item in list',
      shortcutKeyDescription: 'k or left arrow',
      callback: () => actionHandler('moveFocusToPreviousListItem'),
    },
    {
      shortcutKeys: ['m', 's'],
      actionDescription: 'Begin multi select',
      shortcutKeyDescription: 'm then s',
      callback: () => actionHandler('beginMultiSelect'),
    },
    {
      shortcutKeys: ['escape'],
      actionDescription: 'End multi select',
      shortcutKeyDescription: 'Escape',
      callback: () => actionHandler('endMultiSelect'),
    },
    // {
    //   shortcutKeys: ['e'],
    //   actionDescription: 'Archive item',
    //   shortcutKeyDescription: 'e',
    //   callback: () => actionHandler('archiveItem'),
    // },
    // {
    //   shortcutKeys: ['r'],
    //   actionDescription: 'Remove item',
    //   shortcutKeyDescription: 'r',
    //   callback: () => actionHandler('removeItem'),
    // },
    // {
    //   shortcutKeys: ['l'],
    //   actionDescription: 'Edit item labels',
    //   shortcutKeyDescription: 'l',
    //   callback: () => actionHandler('showEditLabelsModal'),
    // },
    // {
    //   shortcutKeys: ['shift', 'i'],
    //   actionDescription: 'Mark item as read',
    //   shortcutKeyDescription: 'shift + i',
    //   callback: () => actionHandler('markItemAsRead'),
    // },
    // {
    //   shortcutKeys: ['shift', 'u'],
    //   actionDescription: 'Mark item as unread',
    //   shortcutKeyDescription: 'shift + u',
    //   callback: () => actionHandler('markItemAsUnread'),
    // },
    // Commented out until we re-enable highlight sharing
    // {
    //   shortcutKeys: ['shift', 's'],
    //   actionDescription: 'Open share modal',
    //   shortcutKeyDescription: 'shift + s',
    //   callback: () => actionHandler('shareItem'),
    // },
    // {
    //   shortcutKeys: ['s', 'o'],
    //   actionDescription: 'Sort item in ascending order',
    //   shortcutKeyDescription: 's then o',
    //   callback: () => actionHandler('sortAscending'),
    // },
    // {
    //   shortcutKeys: ['s', 'n'],
    //   actionDescription: 'Sort item in descending order',
    //   shortcutKeyDescription: 's then n',
    //   callback: () => actionHandler('sortDescending'),
    // },
    {
      shortcutKeys: ['arrowdown'],
      actionDescription: 'Move cursor to the next row',
      shortcutKeyDescription: 'Arrow Down',
      callback: () => actionHandler('moveFocusToNextRowItem'),
    },
    {
      shortcutKeys: ['arrowup'],
      actionDescription: 'Move cursor to the previous row',
      shortcutKeyDescription: 'Arrow Up',
      callback: () => actionHandler('moveFocusToPreviousRowItem'),
    },
  ]
}

type HighlightBarKeyboardAction =
  | 'createHighlight'
  | 'openNoteModal'
  | 'openPostModal'

export function highlightBarKeyboardCommands(
  actionHandler: (action: HighlightBarKeyboardAction) => void
): KeyboardCommand[] {
  return [
    {
      shortcutKeys: ['shift', 'h'],
      actionDescription: 'Highlight selected text',
      shortcutKeyDescription: 'h',
      callback: () => actionHandler('createHighlight'),
    },
    {
      shortcutKeys: ['shift', 'c'],
      actionDescription: 'Annotate selected text',
      shortcutKeyDescription: 'n',
      callback: () => setTimeout(() => actionHandler('openNoteModal'), 0),
    },
    // {
    //   shortcutKeys: ['shift', 's'],
    //   actionDescription: 'Highlight selected text',
    //   shortcutKeyDescription: 'shift + h',
    //   callback: () => actionHandler('openPostModal'),
    // },
  ]
}
