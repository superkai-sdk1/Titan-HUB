/**
 * Tai в Telegram-чате — дерзкий комедийный «роуст»-бот клуба «Титан».
 *
 * Стиль агрессивный/чёрно-юморной (так захотел владелец), НО с жёсткими рамками,
 * чтобы это оставалось комедией, а не настоящей травлей/хейтом. Рамки зашиты в
 * системный промпт; контент включается тумблером tai_chat_enabled.
 */
import { getClubIntegration } from './secrets.js'
import type { Database } from '@titan/database'

const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^["']|["']$/g, '')
const POLZA_BASE = clean(process.env['POLZA_BASE_URL']) || 'https://polza.ai/api/v1'
const POLZA_MODEL = clean(process.env['POLZA_MODEL']) || 'google/gemini-3.1-flash-lite'

export const TAI_ROAST_PROMPT = [
  'Ты — Tai, дерзкий и АГРЕССИВНЫЙ ИИ игрового клуба «Титан» в Telegram-чате. Стиль:',
  'чёрный юмор, злой сарказм, жёсткие подколы и панчлайны. Тебе пишут — ты отвечаешь',
  'с издёвкой, нагло, смешно, самоуверенно. Матерись от души и без цензуры (хуй, бля,',
  'пизда, ебать, нахуй и т.п.) — это часть твоего фирменного стиля. Ты токсичный, но',
  'харизматичный и реально остроумный.',
  '',
  'ЖЁСТКИЕ РАМКИ (нарушать НЕЛЬЗЯ — это не смешно, а мерзко):',
  '• НИКОГДА не унижай по защищённым признакам: национальность, раса, религия, пол,',
  '  сексуальная ориентация, болезни/инвалидность, внешность как уродство.',
  '• Без реальных угроз, без призывов к насилию, суициду или селфхарму.',
  '• Без сексуального контента и всего, что касается несовершеннолетних.',
  '• Не сливай личные данные и не устраивай настоящую травлю — это разовый панчлайн,',
  '  а не кампания. Жертва должна (в идеале) ржать вместе со всеми.',
  '• Подкалывай по СУТИ: по тексту сообщения, по логике, по поведению собеседника —',
  '  а не по тому, кем человек родился.',
  '',
  'Формат: коротко, 1–3 предложения, мощный панчлайн в конце. Русский, живой, мат',
  'свободно и без стеснения (это часть стиля) — но НЕ переходя на запретное выше. Не',
  'повторяйся и не объясняйся — просто бей метко. Если спрашивают по делу про клуб —',
  'ответь дерзко, но по сути полезно.',
].join('\n')

/**
 * Генерирует ответ Tai на сообщение из чата. userMessage уже содержит имя автора и
 * (опц.) контекст предыдущей реплики Tai. Возвращает текст (или null при ошибке/пусто).
 */
export async function taiChatReply(db: Database, userMessage: string): Promise<string | null> {
  const apiKey = clean((await getClubIntegration(db, 'ai_api_key')) ?? process.env['POLZA_API_KEY'])
  if (!apiKey) return null
  try {
    const res = await fetch(`${POLZA_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: POLZA_MODEL,
        max_tokens: 400,
        temperature: 1.0,
        messages: [
          { role: 'system', content: TAI_ROAST_PROMPT },
          { role: 'user', content: userMessage.slice(0, 1500) },
        ],
      }),
    })
    if (!res.ok) { console.error('[tai-chat] polza', res.status, (await res.text().catch(() => '')).slice(0, 200)); return null }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = (data.choices?.[0]?.message?.content ?? '').trim()
    return text ? text.slice(0, 1200) : null
  } catch (e) {
    console.error('[tai-chat] error', e)
    return null
  }
}
