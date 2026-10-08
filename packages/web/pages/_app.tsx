import '../styles/globals.css'
import '../styles/articleInnerStyling.css'

import type { AppProps } from 'next/app'
import Head from 'next/head'
import { IdProvider } from '@radix-ui/react-id'
import { NextRouter, useRouter } from 'next/router'
import { ReactNode, useEffect, useState } from 'react'
import { HydrationBoundary } from '@tanstack/react-query'
import TopBarProgress from 'react-topbar-progress-indicator'
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  Priority,
} from 'kbar'
import {
  animatorStyle,
  KBarResultsComponents,
  searchStyle,
} from '../components/elements/KBar'
import { updateTheme } from '../lib/themeUpdater'
import { ThemeId } from '../components/tokens/stitches.config'
import { GoogleReCaptchaProvider } from '@google-recaptcha/react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import React from 'react'
import { Toaster } from 'react-hot-toast'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 4, // 4hrs
    },
  },
})

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
})

TopBarProgress.config({
  barColors: {
    '0': '#FF4F00',
    '1.0': '#FF4F00',
  },
  shadowBlur: 0,
  barThickness: 2,
})

const generateActions = (router: NextRouter) => {
  return [
    {
      id: 'lightTheme',
      section: 'Preferences',
      name: 'Change theme (light) ',
      shortcut: ['v', 'l'],
      keywords: 'light theme',
      priority: Priority.LOW,
      perform: () => updateTheme(ThemeId.Light),
    },
    {
      id: 'darkTheme',
      section: 'Preferences',
      name: 'Change theme (dark) ',
      shortcut: ['v', 'd'],
      keywords: 'dark theme',
      priority: Priority.LOW,
      perform: () => updateTheme(ThemeId.Dark),
    },
  ]
}

const ConditionalCaptchaProvider = (props: {
  children: ReactNode
}): JSX.Element => {
  if (process.env.NEXT_PUBLIC_RECAPTCHA_CHALLENGE_SITE_KEY) {
    return (
      <GoogleReCaptchaProvider
        type="v2-checkbox"
        isEnterprise={true}
        host="recaptcha.net"
        siteKey={process.env.NEXT_PUBLIC_RECAPTCHA_CHALLENGE_SITE_KEY ?? ''}
      >
        {props.children}
      </GoogleReCaptchaProvider>
    )
  }
  return <>{props.children}</>
}

export function OmnivoreApp({ Component, pageProps }: AppProps): JSX.Element {
  const router = useRouter()

  return (
    <ConditionalCaptchaProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Lets Stash run full screen when added to the iPhone home screen. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Stash" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon-180x180.png?v=stash-folded-s"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#FAFAFA"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#111113"
        />
      </Head>
      <Toaster />
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <KBarProvider actions={generateActions(router)}>
          <KBarPortal>
            <KBarPositioner style={{ zIndex: 100 }}>
              <KBarAnimator style={animatorStyle}>
                <KBarSearch style={searchStyle} />
                <KBarResultsComponents />
              </KBarAnimator>
            </KBarPositioner>
          </KBarPortal>
          <IdProvider>
            <Component {...pageProps} />
          </IdProvider>
        </KBarProvider>
      </PersistQueryClientProvider>
    </ConditionalCaptchaProvider>
  )
}

export default OmnivoreApp
