import type { Context } from 'hono'

// Доверенный IP клиента за nginx. nginx ставит `X-Real-IP $remote_addr`
// (его клиент подделать не может). X-Forwarded-For формируется как
// `$proxy_add_x_forwarded_for` — клиентский префикс спуфится, поэтому если
// X-Real-IP нет, берём ПОСЛЕДНИЙ элемент XFF (добавленный nginx), а не первый.
export function clientIp(c: Context): string {
  return c.req.header('x-real-ip')
    ?? c.req.header('x-forwarded-for')?.split(',').pop()?.trim()
    ?? 'unknown'
}
