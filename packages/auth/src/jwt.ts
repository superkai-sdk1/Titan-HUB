import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'fallback-secret-change-in-production'
)

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
    .sign(secret)
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JwtPayload
}
