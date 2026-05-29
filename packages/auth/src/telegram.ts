import { createHmac } from 'crypto'

export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return false

  params.delete('hash')

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')

  if (expectedHash !== hash) return false

  // Анти-replay: initData не должна быть старше maxAgeSeconds (по auth_date).
  const authDate = parseInt(params.get('auth_date') ?? '0', 10)
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return false

  return true
}

export function parseTelegramInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData)
  const result: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    result[k] = v
  }
  return result
}
