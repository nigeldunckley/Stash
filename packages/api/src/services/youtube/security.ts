import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export function credentialKey(): Buffer {
  const key = Buffer.from(process.env.YOUTUBE_CREDENTIAL_KEY || '', 'base64')
  if (key.length !== 32) throw new Error('YOUTUBE_NOT_CONFIGURED')
  return key
}

export function encryptCredentials(value: unknown, userId: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv)
  cipher.setAAD(Buffer.from(userId))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), encrypted]
    .map((v) => v.toString('base64'))
    .join('.')
}

export function decryptCredentials<T>(value: string, userId: string): T {
  const [iv, tag, ciphertext] = value
    .split('.')
    .map((v) => Buffer.from(v, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), iv)
  decipher.setAAD(Buffer.from(userId))
  decipher.setAuthTag(tag)
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString()
  ) as T
}

export const durationSeconds = (value: string): number => {
  const match =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      value
    )
  return match
    ? Number(match[1] || 0) * 86400 +
        Number(match[2] || 0) * 3600 +
        Number(match[3] || 0) * 60 +
        Number(match[4] || 0)
    : 0
}

export const shouldImportVideo = (seconds: number, hideShort: boolean) =>
  !hideShort || seconds >= 180
