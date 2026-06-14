// ─────────────────────────────────────────────────────────────────────────────
// Тонкий клиент Telegram Bot API для ИСХОДЯЩИХ вызовов (sendPoll и т.п.).
// Постинг опросов не требует «живого» бот-процесса — достаточно HTTP-вызова от
// токена бота. (Чтение результатов опросов потребует getUpdates/вебхук — отдельно.)
// ─────────────────────────────────────────────────────────────────────────────

const TG_API = 'https://api.telegram.org'

export interface SendPollParams {
  chatId: string | number
  /** message_thread_id топика форума (если опрос в топик супергруппы). */
  messageThreadId?: number | null
  question: string
  options: string[]
  isAnonymous?: boolean
  allowsMultipleAnswers?: boolean
}

export interface SendPollResult {
  ok: boolean
  messageId?: number
  pollId?: string
  error?: string
}

/**
 * Отправить опрос в чат/топик. options — массив строк (оборачиваем в
 * InputPollOption по требованию Bot API ≥7.3). Никогда не бросает — возвращает
 * { ok:false, error } при сетевой/Telegram-ошибке (описание из поля description).
 */
export async function sendTelegramPoll(token: string, p: SendPollParams): Promise<SendPollResult> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: p.chatId,
        ...(p.messageThreadId ? { message_thread_id: p.messageThreadId } : {}),
        question: p.question,
        options: p.options.map((t) => ({ text: t })),
        is_anonymous: p.isAnonymous ?? false,
        allows_multiple_answers: p.allowsMultipleAnswers ?? false,
        type: 'regular',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
      result?: { message_id?: number; poll?: { id?: string } }
    }
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description || `HTTP ${res.status}` }
    }
    return { ok: true, messageId: data.result?.message_id, pollId: data.result?.poll?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
