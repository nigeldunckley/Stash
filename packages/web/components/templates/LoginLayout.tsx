import {
  Box,
  HStack,
  MediumBreakpointBox,
  VStack,
} from '../elements/LayoutPrimitives'
import { LoginForm } from './LoginForm'
import type { LoginFormProps } from './LoginForm'
import { OmnivoreNameLogo } from '../elements/images/OmnivoreNameLogo'
import { theme } from '../tokens/stitches.config'

export function LoginLayout(props: LoginFormProps): JSX.Element {
  return (
    <>
      <MediumBreakpointBox
        smallerLayoutNode={<MobileLoginLayout {...props} />}
        largerLayoutNode={<MediumLoginLayout {...props} />}
      />

      <Box
        css={{
          position: 'absolute',
          top: 0,
          left: 0,
          p: '0px 28px',
          height: '76px',
          minHeight: '68px',
          display: 'flex',
          alignItems: 'center',
          '@md': { width: '50%' },
          '@xsDown': { height: '48px' },
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <OmnivoreNameLogo
          showTitle={true}
          href="/login"
          color={theme.colors.thTextContrast.toString()}
        />
      </Box>
    </>
  )
}

function MobileLoginLayout(props: LoginFormProps) {
  return (
    <VStack css={{ height: '100vh', overflow: 'auto' }}>
      <VStack
        alignment="center"
        distribution="center"
        css={{
          width: '100%',
          flexGrow: 1,
          background: '$thBackground',
        }}
      >
        <LoginForm {...props} />
      </VStack>
    </VStack>
  )
}

function MediumLoginLayout(props: LoginFormProps) {
  return (
    <HStack
      alignment="center"
      distribution="start"
      css={{
        width: '100vw',
        height: '100vh',
        overflowY: 'clip',
        background: '$thBackground',
      }}
    >
      <Box
        css={{
          width: '100%',
          margin: '40px',
          '@xl': { margin: '138px' },
        }}
      >
        <LoginForm {...props} />
      </Box>
      <StashPanel />
    </HStack>
  )
}

function StashPanel() {
  return (
    <VStack
      alignment="start"
      distribution="between"
      css={{
        width: '100%',
        height: 'calc(100% - 24px)',
        margin: '12px',
        padding: '48px',
        borderRadius: '18px',
        bg: '#FF4F00',
        color: '#09090B',
      }}
    >
      <Box
        css={{
          fontFamily: '$mono',
          fontSize: '12px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Read later, properly
      </Box>
      <Box
        css={{
          fontFamily: '$display',
          fontSize: '72px',
          fontWeight: 600,
          lineHeight: 0.98,
          letterSpacing: '-0.05em',
          '@lgDown': { fontSize: '52px' },
        }}
      >
        Save it now.
        <br />
        Read it well.
      </Box>
    </VStack>
  )
}
