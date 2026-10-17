import { useEffect } from 'react'
import { fetchIsSignedIn } from '../networking/viewer/useGetViewer'

// If the sign-in cookie is still good, the login page has nothing to do:
// go straight back into the app instead of asking for the password again.
export function useRedirectIfSignedIn() {
  useEffect(() => {
    fetchIsSignedIn().then((signedIn) => {
      if (signedIn) {
        const next = new URLSearchParams(window.location.search).get('redirect')
        window.localStorage.setItem('authVerified', 'true')
        window.location.replace(
          next && next.startsWith('/') && !next.startsWith('//')
            ? next
            : '/home'
        )
      }
    })
  }, [])
}
