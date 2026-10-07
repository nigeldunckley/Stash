import { Box, HStack } from '../../elements/LayoutPrimitives'

export function ResetSent(): JSX.Element {
  return (
    <>
      <HStack
        alignment="center"
        distribution="start"
        css={{
          width: '100vw',
          height: '100vh',
          color: '$thTextSubtle2',
          background: '$thBackground2',
          overflowY: 'clip',
        }}
      >
        <Box
          css={{
            width: '100%',
            margin: '40px',
            color: '$thTextSubtle2',
            '@xl': { margin: '138px' },
          }}
        >
          <h1 style={{ color: 'var(--colors-thTextContrast)' }}>Reset email sent</h1>
          <Box>
            If there is an account associated with the email specified we sent a
            password reset link. Click the link to reset your password. You may
            need to check your spam folder.
          </Box>
        </Box>
      </HStack>
    </>
  )
}
