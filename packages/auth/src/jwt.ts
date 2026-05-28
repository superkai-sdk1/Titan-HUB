import { SignJWT, jwtVerify } from 'jose'

// Никаких небезопасных фолбэков: секрет обязателен и должен быть стойким.
// Вычисляем лениво, чтобы простой импорт модуля не падал в окружениях,
// где токены не используются, но при первом sign/verify без секрета — ошибка.
function getSecret(): Uint8Array {
  const value = process.env['JWT_SECRET']
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value (at least 32 characters)')
  }
  return new TextEncoder().encode(value)
}

export interface JwtPayload {
  sub: string
  role: string
  nickname: string
  iat?: number
  exp?: number
}

export async function signToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresIn?: string,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? process.env['JWT_EXPIRES_IN'] ?? '7d')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as JwtPayload
}
