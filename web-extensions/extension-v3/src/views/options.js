const DEFAULT_STASH_URL = 'https://stash.nigeldunckley.com'

function serverUrl(value) {
  const trimmed = (value || '').trim().replace(/\/+$/, '')
  return trimmed || DEFAULT_STASH_URL
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('server-url')
  const keyInput = document.getElementById('api-key')
  const apiLink = document.getElementById('api-link')
  const status = document.getElementById('status')
  const saveButton = document.getElementById('save-btn')

  const stored = await chrome.storage.local.get([
    'omnivoreApiKey',
    'omnivoreUrl',
  ])
  urlInput.value = stored.omnivoreUrl ?? ''
  keyInput.value = stored.omnivoreApiKey ?? ''

  const updateLink = () => {
    apiLink.href = `${serverUrl(urlInput.value)}/settings/api`
  }
  updateLink()
  urlInput.addEventListener('input', updateLink)

  saveButton.addEventListener('click', async () => {
    const url = serverUrl(urlInput.value)
    // The web app and API share one origin behind Caddy.
    await chrome.storage.local.set({
      omnivoreApiKey: keyInput.value.trim(),
      omnivoreUrl: url,
      omnivoreApiUrl: url,
    })
    urlInput.value = url
    status.textContent = 'Saved'
    setTimeout(() => (status.textContent = ''), 2000)
  })
})
