import { createHmac } from 'crypto'

export function verifyTelegramInitData(initData: string, botToken: string): boolean {
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

  return expectedHash === hash
}

export function parseTelegramInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData)
  const result: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    result[k] = v
  }
  return result
}
