import * as RadixContextMenu from '@radix-ui/react-context-menu'
import { Fragment, ReactNode } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { floatingShadow, glassStrong, hairlineEdge } from './material'
import { reducedMotion, spring } from './motion'
import { showUndoToast } from './UndoToast'

// Menus look and behave like macOS menus: frosted, a hairline edge, rows
// with rounded highlights and the shortcut in grey at the end.

const appear = keyframes({
  from: { opacity: 0, transform: 'scale(0.96)' },
  to: { opacity: 1, transform: 'scale(1)' },
})
const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const menuContentStyles = {
  zIndex: 100,
  minWidth: '200px',
  maxWidth: 'calc(100vw - 24px)',
  boxSizing: 'border-box',
  padding: '5px',
  ...glassStrong,
  ...hairlineEdge,
  borderRadius: '10px',
  boxShadow: floatingShadow,
  color: '$stInk',
  fontFamily: '$inter',
  fontSize: '13.5px',
  lineHeight: 1.3,
  animation: `${appear} 200ms ${spring}`,
  '&:focus': { outline: 'none' },
  [reducedMotion]: { animation: `${fade} 120ms linear` },
}

export const menuItemStyles = {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '30px',
  padding: '5px 10px',
  borderRadius: '6px',
  color: '$stInk',
  cursor: 'default',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  '& svg': { flex: 'none', color: '$stMuted' },
  '&[data-highlighted]': { background: '$stSunken', outline: 'none' },
  '&[data-disabled]': { opacity: 0.45 },
  '@media (pointer: coarse)': { minHeight: '40px' },
}

export const menuSeparatorStyles = {
  height: '1px',
  margin: '5px 6px',
  background: '$stLine',
}

// Set in the system face, which has the ⌫ ↵ ⌘ glyphs, as macOS does.
export const MenuShortcut = styled('span', {
  marginLeft: 'auto',
  paddingLeft: '18px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Geist', sans-serif",
  fontSize: '12.5px',
  color: '$stMuted',
  // No keyboard on iPhone, so no shortcuts.
  '@media (pointer: coarse)': { display: 'none' },
})

const Content = styled(RadixContextMenu.Content, {
  ...menuContentStyles,
  transformOrigin: 'var(--radix-context-menu-content-transform-origin)',
})

const Item = styled(RadixContextMenu.Item, {
  ...menuItemStyles,
  variants: {
    destructive: {
      true: {
        color: '$stDanger',
        '& svg': { color: '$stDanger' },
      },
    },
  },
})

const Separator = styled(RadixContextMenu.Separator, menuSeparatorStyles)

const SubTrigger = styled(RadixContextMenu.SubTrigger, {
  ...menuItemStyles,
  '&[data-state="open"]': { background: '$stSunken' },
})

const SubContent = styled(RadixContextMenu.SubContent, {
  ...menuContentStyles,
  transformOrigin: 'var(--radix-context-menu-content-transform-origin)',
})

// Shown on touch screens too, unlike shortcuts.
const Detail = styled('span', {
  marginLeft: 'auto',
  paddingLeft: '18px',
  fontSize: '12.5px',
  color: '$stMuted',
  whiteSpace: 'nowrap',
})

// A tick for the chosen entry in a list of choices.
const Check = styled('span', {
  width: '12px',
  marginLeft: 'auto',
  paddingLeft: '18px',
  color: '$stAccentText',
  fontSize: '12px',
  textAlign: 'right',
})

export type MenuEntry = {
  label: string
  icon?: ReactNode
  shortcut?: string
  destructive?: boolean
  // Draw a line above this entry.
  separated?: boolean
  // Shown at the end in grey, such as the current choice of a submenu.
  detail?: string
  // Marks the chosen entry in a submenu.
  checked?: boolean
  // Opens a further menu instead of acting.
  submenu?: MenuEntry[]
  onSelect: () => void
}

function MenuEntries(props: { entries: MenuEntry[] }): JSX.Element {
  return (
    <>
      {props.entries.map((entry) => (
        <Fragment key={entry.label}>
          {entry.separated && <Separator />}
          {entry.submenu ? (
            <RadixContextMenu.Sub>
              <SubTrigger>
                {entry.icon}
                {entry.label}
                <Detail>{entry.detail ? `${entry.detail} ›` : '›'}</Detail>
              </SubTrigger>
              <RadixContextMenu.Portal>
                <SubContent collisionPadding={12} sideOffset={4}>
                  <MenuEntries entries={entry.submenu} />
                </SubContent>
              </RadixContextMenu.Portal>
            </RadixContextMenu.Sub>
          ) : (
            <Item destructive={entry.destructive} onSelect={entry.onSelect}>
              {entry.icon}
              {entry.label}
              {entry.checked && <Check aria-label="Chosen">✓</Check>}
              {entry.shortcut && <MenuShortcut>{entry.shortcut}</MenuShortcut>}
            </Item>
          )}
        </Fragment>
      ))}
    </>
  )
}

// Right-click on a Mac, or press and hold on iPhone, to get the item's
// actions without hunting for its ⋯ button.
export function ContextMenu(props: {
  entries: MenuEntry[]
  children: ReactNode
  onOpenChange?: (open: boolean) => void
}): JSX.Element {
  if (props.entries.length === 0) {
    return <>{props.children}</>
  }
  return (
    <RadixContextMenu.Root modal={false} onOpenChange={props.onOpenChange}>
      <RadixContextMenu.Trigger asChild data-st-menu="">
        {props.children}
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <Content collisionPadding={12}>
          <MenuEntries entries={props.entries} />
        </Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  )
}

// Shared entries for anything with a link.
// `openOriginal` replaces the plain window.open, for lists that also need to
// record the visit (Feeds marks the item seen).
export function linkEntries(
  url: string,
  openOriginal?: () => void
): MenuEntry[] {
  const entries: MenuEntry[] = [
    {
      label: 'Open original',
      separated: true,
      onSelect:
        openOriginal ??
        (() => window.open(url, '_blank', 'noopener,noreferrer')),
    },
    {
      label: 'Copy link',
      onSelect: () => {
        navigator.clipboard
          ?.writeText(url)
          .then(() => showUndoToast('Link copied'))
          .catch(() => undefined)
      },
    },
  ]
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    entries.push({
      label: 'Share…',
      onSelect: () => {
        navigator.share({ url }).catch(() => undefined)
      },
    })
  }
  return entries
}
