// ─── API-клиент суперадмина платформы ─────────────────────────────────────────
//
// ПОЛНОСТЬЮ отдельный контур от клубной авторизации:
//   • токен хранится под СВОИМ ключом `titan_sa_token` (НЕ трогаем auth.store!);
//   • базовый префикс всех путей — `/api/superadmin`;
//   • на 401 чистим только наш токен (clearSaToken) — НЕ редиректим и НЕ трогаем
//     клубный стор; экран входа покажет вызывающий компонент.
//
// Паттерн request/ApiError зеркалит apps/web/src/lib/api.ts.

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/superadmin`

const SA_TOKEN_KEY = 'titan_sa_token'

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getSaToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SA_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setSaToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SA_TOKEN_KEY, token)
  } catch {
    /* приватный режим / квота — игнорируем */
  }
}

export function clearSaToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SA_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

// ─── ApiError ─────────────────────────────────────────────────────────────────

class SaApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SaApiError'
  }
}

// ─── request ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSaToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers,
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    // 401 → токен суперадмина протух/недействителен: чистим только НАШ токен.
    // НЕ редиректим и НЕ трогаем клубный auth.store — экран входа покажет
    // сама страница /superadmin (она ловит ошибку и переключает state).
    if (res.status === 401 && token) {
      clearSaToken()
    }
    // body.error может быть строкой ЛИБО объектом (ZodError от zValidator).
    // Приводим к читаемой строке, иначе message станет «[object Object]».
    const err = (body as Record<string, unknown>)?.error as
      | string
      | { issues?: Array<{ message?: string }>; message?: string }
      | undefined
    const message: string =
      typeof err === 'string'
        ? err
        : err?.issues?.[0]?.message ??
          err?.message ??
          ((body as Record<string, unknown>)?.message as string | undefined) ??
          res.statusText
    throw new SaApiError(res.status, message, body)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── saApi ────────────────────────────────────────────────────────────────────

export const saApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export { SaApiError }
