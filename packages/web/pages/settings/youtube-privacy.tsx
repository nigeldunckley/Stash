import Link from 'next/link'
import { styled } from '../../components/tokens/stitches.config'
const Content = styled('article', {
  margin: '24px auto',
  padding: '0 24px 40px',
  maxWidth: '65ch',
  color: '$stInk',
  fontFamily: '$inter',
  lineHeight: 1.7,
  '& p, & li': { color: '$stMuted' },
  '& a': { color: '$stAccentText' },
})
export default function YouTubePrivacy(): JSX.Element {
  return (
    <Content>
      <h1>YouTube in Stash</h1>
      <p>
        Stash uses YouTube API Services and YouTube’s embedded player. Your use
        is also subject to the{' '}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>{' '}
        and{' '}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
      </p>
      <p>
        Connecting grants read-only access to your YouTube channel identity and
        subscriptions. Stash stores an encrypted authorization token on your
        server to keep subscriptions up to date. Tokens are never stored in the
        browser or native app. Stash does not change your YouTube subscriptions,
        upload videos, or access your YouTube watch history or Watch Later list.
      </p>
      <p>
        Stash uses public channel and video details to display titles,
        thumbnails, descriptions and duration. API metadata is refreshed or
        removed within 30 days. Your Stash notes, collections and watching
        progress are Stash features, separate from YouTube data.
      </p>
      <p>
        Opening a YouTube player shares information with YouTube to show and
        play the video. Playback can share further information with YouTube.
        Stash does not collect playback progress for videos identified as Made
        for Kids.
      </p>
      <p>
        Disconnect in Settings to revoke access and remove stored
        account-derived YouTube data. Imported-only channels stop receiving
        videos. Independently followed channels and saved video links remain.
        Disconnecting Stash does not delete anything on YouTube. You can also
        revoke access through{' '}
        <a href="https://security.google.com/settings/security/permissions">
          Google’s permissions settings
        </a>
        . Invalid authorizations are checked during background sync and their
        account data is removed.
      </p>
      <p>
        To remove your stored account data, disconnect YouTube and delete your
        Stash account in Settings. Contact your Stash server operator for
        questions about server backups and data deletion.
      </p>
      <Link href="/settings/integrations">Manage YouTube connection</Link>
    </Content>
  )
}
