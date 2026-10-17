# Watch viewing modes

Theatre mode expands the existing player inside the browser window and hides
navigation, Up next, and the video details. The iframe stays mounted. The Theatre
button or T toggles the mode; Escape exits theatre before navigating back. The
normal sidebar preference is preserved. Playback speed, queue, and autoplay
continue to work.

## Native Safari picture-in-picture

Stash retains `picture-in-picture` in the iframe's `allow` policy. Safari owns the
separate, resizable, always-on-top video window. Stash does not open a popup or
imitate a native player with a draggable HTML element.

On Safari for Mac, play the video, open the Page menu in the address bar, and
choose **Enter Picture in Picture**. For automatic switching, choose **Video
Viewer** first (when Safari offers it), then switch tabs or apps. Safari controls
availability and the transition. The Stash button explains these steps; its
ellipsis indicates that it opens guidance, not a direct PiP command.

YouTube owns the video element in a cross-origin iframe. Its public player API
does not expose picture-in-picture, and Stash cannot call Safari's video-element
API across that boundary. A direct Stash-native activation button or Stash-owned
automatic toggle therefore remains unavailable with this embed. Safari's native
Video Viewer is the supported automatic path, subject to video eligibility.

## Highest resolution

Use the embedded video's **Settings → Quality** menu to select the highest
resolution listed. YouTube no longer supports its public quality-setting API, so
Stash cannot force this for every video. There is intentionally no fake saved
quality preference, unsupported `setPlaybackQuality` command, or `vq` parameter.

## Acceptance

- Open a saved video; enter and exit theatre with the button, T, and Escape.
- The playback position, speed, and iframe stay intact through mode changes.
- Sidebar and mobile navigation disappear in theatre and return on exit.
- Open a help popover; Escape closes it without leaving theatre or the video.
- Use Safari's Page menu with a playing YouTube embed. Verify PiP moves outside
  Safari, can be resized, and restores the same video. Verify Video Viewer
  eligibility and automatic switching with the Safari version in use.
- Select quality in YouTube's menu and verify its actual resolution there.

The Safari/YouTube native playback checks require an authenticated, running Stash
instance and Safari; a component preview alone does not establish acceptance.

## Verification on 17 October 2026

On the authenticated production Watch page in Safari, the existing YouTube embed
entered Safari Video Viewer. Switching to another tab automatically created a
native `com.apple.PIPAgent` floating window with Restore, Pause, Close, and skip
controls. Restore returned to the same Watch video, then Escape exited Viewer.
This verifies native Safari interoperability with the current embed; it does not
turn the new Stash help button into a direct native activation button.

The local component preview uses the actual WatchPlayerPage and viewing controls
with fixture data. Theatre enlarged its player from 848px to 1024px without
reassigning the player slot. Escape closed the PiP guidance while preserving
theatre, and a second Escape exited theatre. The new viewing-controls component
passed an isolated TypeScript check; all changed TSX files passed syntax checks.
The full workspace typecheck remains unverified because this checkout has no
installed application dependencies. These changes have not been deployed.

References:

- https://support.apple.com/en-gb/guide/safari/ibrw27291639/mac
- https://support.apple.com/en-gb/guide/safari/ibrwf2f09b3a/mac
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/iframe_api_revision_history
