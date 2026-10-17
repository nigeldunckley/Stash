import { PageMetaData } from '../../components/patterns/PageMetaData'
import { AuthLayout } from '../../components/templates/AuthLayout'
import { EmailLogin } from '../../components/templates/auth/EmailLogin'
import { useRedirectIfSignedIn } from '../../lib/hooks/useRedirectIfSignedIn'

export default function EmailLoginPage(): JSX.Element {
  useRedirectIfSignedIn()
  return (
    <AuthLayout>
      <PageMetaData title="Login - Stash" path="/email-login" />
      <EmailLogin />
      <div data-testid="email-login-page-tag" />
    </AuthLayout>
  )
}
