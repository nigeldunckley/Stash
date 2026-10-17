import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { fetchIsSignedIn } from '../networking/viewer/useGetViewer'

export function useVerifyAuth() {
  const router = useRouter()

  useEffect(() => {
    if (window.localStorage.getItem('authVerified')) {
      return
    }
    // Safari can clear local storage on its own; the sign-in cookie is what
    // counts, so check with the server before sending anyone to the login page.
    fetchIsSignedIn().then((signedIn) => {
      if (signedIn) {
        window.localStorage.setItem('authVerified', 'true')
      } else if (signedIn === false) {
        window.location.href = `/login?redirect=${window.location.pathname}`
      }
    })
  }, [router])
}
