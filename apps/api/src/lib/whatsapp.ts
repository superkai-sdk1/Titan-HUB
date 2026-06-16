/**
 * WhatsApp Business — отправка через Meta Cloud API (graph.facebook.com).
 *
 * Проактивные сообщения (вне 24-часового окна диалога) допускаются ТОЛЬКО
 * одобренными шаблонами (создаются заведением в Meta Business Manager). Поэтому
 * шлём template-сообщения: имя шаблона + язык + параметры тела ({{1}}, {{2}}…).
 *
 * Креды — пер-клубные (integrations, шифрованно): whatsapp_phone_id (Phone Number
 * ID) + whatsapp_token (постоянный access token). Наружу не отдаются.
 */
import type { Database } from '@titan/database'
import { getClubIntegration } from './secrets.js'

const GRAPH = 'https://graph.facebook.com/v20.0'

export interface WhatsAppConfig {
  phoneId: string
  token: string
}

/** Креды WhatsApp клуба или null, если не настроены. */
export async function getWhatsAppConfig(db: Database): Promise<WhatsAppConfig | null> {
  const phoneId = await getClubIntegration(db, 'whatsapp_phone_id')
  const token = await getClubIntegration(db, 'whatsapp_token')
  if (!phoneId || !token) return null
  return { phoneId, token }
}

/** Телефон → формат WhatsApp (цифры с кодом страны, E.164 без +). RU: 8XXX → 7XXX. */
export function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length === 10) d = '7' + d // без кода страны → РФ
  return d
}

/**
 * Отправляет шаблонное сообщение. bodyParams — значения подстановок тела шаблона.
 * Возвращает {ok} или {ok:false, error} (наружу текст ошибки не светим — для лога).
 */
export async function sendWhatsAppTemplate(
  cfg: WhatsAppConfig,
  to: string,
  template: string,
  lang: string,
  bodyParams: string[] = [],
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const phone = normalizePhone(to)
  if (!phone) return { ok: false, error: 'empty phone' }

  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) }]
    : []

  let res: Response
  try {
    res = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: template, language: { code: lang || 'ru' }, components },
      }),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = data['error'] as Record<string, unknown> | undefined
    return { ok: false, error: `${res.status}: ${String(err?.['message'] ?? 'unknown')}`.slice(0, 250) }
  }
  const msgs = data['messages'] as Array<Record<string, unknown>> | undefined
  return { ok: true, messageId: msgs?.[0]?.['id'] ? String(msgs[0]!['id']) : undefined }
}
