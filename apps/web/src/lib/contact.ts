// Ссылки для связи с заказчиком по номеру телефона.
// Нормализация: оставляем цифры, ведущую 8 (рус. межгород) меняем на 7.

export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1)
  return digits
}

export function telLink(phone: string | null | undefined): string {
  const d = normalizePhone(phone)
  return d ? `tel:+${d}` : ''
}

export function whatsappLink(phone: string | null | undefined): string {
  const d = normalizePhone(phone)
  return d ? `https://wa.me/${d}` : ''
}

// У Telegram нет официального https-линка «написать по номеру» (только по @username),
// поэтому tg://resolve?phone= — открывает приложение Telegram и находит чат, если
// номер есть в контактах/Telegram. Best-effort.
export function telegramLink(phone: string | null | undefined): string {
  const d = normalizePhone(phone)
  return d ? `tg://resolve?phone=${d}` : ''
}

// Открыть ссылку (мессенджеры/тел) — в новой вкладке/приложении, безопасно.
export function openContact(url: string) {
  if (!url) return
  if (typeof window !== 'undefined') window.open(url, '_blank')
}
