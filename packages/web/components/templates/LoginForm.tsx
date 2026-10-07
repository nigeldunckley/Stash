import Link from 'next/link'
import { StyledText, StyledTextSpan } from '../elements/StyledText'
import { VStack, Box, SpanBox } from '../elements/LayoutPrimitives'
import { styled } from '../tokens/stitches.config'
import { googleID, gauthRedirectURI } from '../../lib/appConfig'
import { useEffect } from 'react'

export type LoginFormProps = {
  errorMessage?: string
}

export function LoginForm(props: LoginFormProps): JSX.Element {
  const StyledTextHeadline = styled('h1', {
    fontFamily: '$display',
    fontStyle: 'normal',
    fontWeight: '600',
    fontSize: '48px',
    lineHeight: '1.02',
    letterSpacing: '-0.04em',
    color: '$thTextContrast',
    m: '0px',
    '@mdDown': { fontSize: '36px' },
  })

  const ActionLink = styled('a', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '44px',
    px: '20px',
    borderRadius: '10px',
    fontFamily: '$display',
    fontSize: '15px',
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'pointer',
    variants: {
      kind: {
        primary: {
          bg: '$thTextContrast',
          color: '$thBackground',
          '&:hover': { opacity: 0.85 },
        },
        secondary: {
          bg: '$thBackground',
          color: '$thTextContrast',
          border: '1px solid $thBorderColor',
          '&:hover': { borderColor: '$grayBorderHover' },
        },
      },
    },
  })

  return (
    <VStack
      alignment="start"
      distribution="center"
      css={{
        gap: '14px',
        maxWidth: '440px',
        '@mdDown': {
          maxWidth: '85%',
        },
      }}
    >
      <StyledText
        css={{
          fontFamily: '$mono',
          fontSize: '12px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '$thTextSubtle2',
          m: '0px',
        }}
      >
        Welcome back
      </StyledText>
      <StyledTextHeadline>Sign in to your Stash.</StyledTextHeadline>
      <StyledText
        css={{
          fontWeight: '400',
          fontSize: '17px',
          lineHeight: '150%',
          m: '0px',
          color: '$thTextSubtle2',
        }}
      >
        Your saved articles, feeds and highlights, kept on your own server.
      </StyledText>

      <SpanBox css={{ height: '12px' }} />

      {props.errorMessage && (
        <StyledText style="error" css={{ m: '0px' }}>
          {props.errorMessage}
        </StyledText>
      )}

      <Box css={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        <Link href="/auth/email-login" passHref legacyBehavior>
          <ActionLink kind="primary">Continue with email</ActionLink>
        </Link>
        <Link href="/auth/email-signup" passHref legacyBehavior>
          <ActionLink kind="secondary">Create account</ActionLink>
        </Link>
      </Box>

      {googleID && (
        <Box
          style={{
            cursor: 'pointer',
            display: 'inline-flex',
            height: '40px',
            marginTop: '8px',
          }}
        >
          <GoogleAuthButton />
        </Box>
      )}
    </VStack>
  )
}

function GoogleAuthButton() {
  useEffect(() => {
    const script = document.createElement('script')

    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true

    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <Box css={{ overflow: 'hidden' }}>
      <div
        id="g_id_onload"
        data-client_id={googleID}
        data-context="use"
        data-ux_mode="popup"
        data-login_uri={gauthRedirectURI}
        data-auto_prompt="false"
      />

      <div
        className="g_id_signin"
        data-type="standard"
        data-shape="rectangular"
        data-theme="outline"
        data-text="continue_with"
        data-size="large"
        data-logo_alignment="center"
        data-width="261"
      />
    </Box>
  )
}

export function TermAndConditionsFooter(): JSX.Element {
  return (
    <StyledText
      style="caption"
      css={{
        maxWidth: '220px',
        textAlign: 'left',
        color: '$omnivoreLightGray',
      }}
    >
      By signing up, you agree to the{' '}
      <Link href="/terms" passHref legacyBehavior>
        <StyledTextSpan
          style="captionLink"
          css={{ color: '$omnivoreLightGray' }}
        >
          Terms of Service
        </StyledTextSpan>
      </Link>{' '}
      and{' '}
      <Link href="/privacy" passHref legacyBehavior>
        <StyledTextSpan
          style="captionLink"
          css={{ color: '$omnivoreLightGray' }}
        >
          Privacy Policy
        </StyledTextSpan>
      </Link>
    </StyledText>
  )
}
