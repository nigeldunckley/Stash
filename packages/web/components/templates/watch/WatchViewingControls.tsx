import {
  CornersIn,
  PictureInPicture,
  Rectangle,
  Gear,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Popover } from '../../elements/stash/Popover'
import { styled } from '../../tokens/stitches.config'

const Bar = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 0',
  '@mdDown': { padding: '10px 16px' },
})

const Control = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minHeight: '36px',
  padding: '0 10px',
  borderRadius: '$sm',
  fontFamily: '$inter',
  fontSize: '$caption',
  color: '$stInk',
  cursor: 'pointer',
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&[aria-pressed="true"]': { color: '$stAccentText' },
  '@mdDown': { minHeight: '44px' },
})

const Help = styled('div', {
  width: '300px',
  maxWidth: 'calc(100vw - 60px)',
  lineHeight: 1.55,
  '& h2': { margin: '0 0 10px', fontSize: '$body', fontWeight: 600 },
  '& p': { margin: '10px 0', color: '$stMuted' },
  '& ol': { margin: '10px 0', paddingLeft: '20px' },
  '& li': { margin: '6px 0' },
  '& a': { color: '$stAccentText', textDecoration: 'underline' },
})

// YouTube owns the cross-origin video element. Its public API exposes neither
// PiP nor quality selection, so use Safari's native controls without inventing
// commands, a popup browser window, or a quality preference we cannot apply.
export function WatchViewingControls(props: {
  theatre: boolean
  onToggleTheatre: () => void
}): JSX.Element {
  const [safari, setSafari] = useState(false)
  const [pipHelpOpen, setPipHelpOpen] = useState(false)
  const [qualityHelpOpen, setQualityHelpOpen] = useState(false)
  useEffect(() => {
    setSafari(
      /Macintosh/.test(navigator.userAgent) &&
        !/Mobile\//.test(navigator.userAgent) &&
        /Safari\//.test(navigator.userAgent) &&
        !/Chrome\/|Chromium\/|Edg\/|OPR\/|CriOS\/|FxiOS\/|EdgiOS\//.test(
          navigator.userAgent
        )
    )
  }, [])

  // A popover's Escape should close it without leaving theatre or the video.
  // Radix handles the event; the player ignores open dialogs.
  return (
    <Bar role="group" aria-label="Viewing options">
      <Popover
        open={pipHelpOpen}
        onOpenChange={setPipHelpOpen}
        label="Native picture-in-picture"
        trigger={
          <Control aria-label="How to enter native picture-in-picture">
            <PictureInPicture size={17} /> Picture-in-picture…
          </Control>
        }
      >
        <Help>
          <h2>
            {safari ? 'Safari picture-in-picture' : 'Native picture-in-picture'}
          </h2>
          {safari ? (
            <>
              <ol>
                <li>Start playing the video.</li>
                <li>Open Safari’s Page menu in the address bar.</li>
                <li>
                  Choose <strong>Enter Picture in Picture</strong>.
                </li>
              </ol>
              <p>
                The native player stays above other apps. Drag it to move it, or
                drag an edge to resize it.
              </p>
              <h2>Switch automatically</h2>
              <p>
                Choose <strong>Video Viewer</strong> in Safari’s Page menu
                first. When Viewer is available, Safari moves the video into
                picture-in-picture as you switch tabs or apps.
              </p>
              <a
                href="https://support.apple.com/en-gb/guide/safari/ibrwf2f09b3a/mac"
                target="_blank"
                rel="noreferrer"
              >
                Safari’s Video Viewer guide
              </a>
            </>
          ) : (
            <p>
              Use your browser’s video or media menu to enter
              picture-in-picture. In Safari on Mac, use the Page menu in the
              address bar. Availability depends on your browser and the video.
            </p>
          )}
          <p>YouTube’s embedded player requires the browser’s own controls.</p>
        </Help>
      </Popover>
      <Control
        onClick={props.onToggleTheatre}
        aria-pressed={props.theatre}
        title={
          props.theatre ? 'Exit theatre (T or Escape)' : 'Theatre mode (T)'
        }
      >
        {props.theatre ? <CornersIn size={17} /> : <Rectangle size={17} />}
        {props.theatre ? 'Exit theatre' : 'Theatre'}
      </Control>
      <Popover
        open={qualityHelpOpen}
        onOpenChange={setQualityHelpOpen}
        label="Video quality"
        trigger={
          <Control>
            <Gear size={17} /> Video quality
          </Control>
        }
      >
        <Help>
          <h2>Choose the highest resolution</h2>
          <p>
            In the video’s own controls, open{' '}
            <strong>Settings → Quality</strong> and select the highest
            resolution listed.
          </p>
          <p>
            YouTube selects quality automatically and does not let Stash force a
            resolution. Available resolutions vary by video.
          </p>
        </Help>
      </Popover>
    </Bar>
  )
}
