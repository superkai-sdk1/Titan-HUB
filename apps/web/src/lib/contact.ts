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

// ── Карта и такси по текстовому адресу мероприятия (выезд) ───────────────────

// Маршрут в Яндекс.Картах от ТЕКУЩЕЙ геопозиции (~) до адреса, на авто. Универсальная
// ссылка: на телефоне открывает приложение Яндекс.Карты, иначе — веб.
export function mapsRouteUrl(address: string | null | undefined): string {
  const a = (address ?? '').trim()
  return a ? `https://yandex.ru/maps/?rtext=~${encodeURIComponent(a)}&rtt=auto` : ''
}

// Заказ такси в Яндекс Go по координатам точки назначения (старт = текущая
// геопозиция в приложении). Универсальная ссылка appmetrica открывает приложение
// Яндекс Go (или магазин, если не установлено).
export function taxiUrlFromCoords(lat: number, lon: number): string {
  return `https://3.redirect.appmetrica.yandex.com/route?end-lat=${lat}&end-lon=${lon}&ref=titanhub&appmetrica_tracking_id=1178268795219780156`
}

// Запасной вариант такси без координат: Яндекс.Карты в режиме «такси» по тексту
// адреса (маршрут построен, остаётся подтвердить заказ → передача в Яндекс Go).
export function taxiMapsFallbackUrl(address: string | null | undefined): string {
  const a = (address ?? '').trim()
  return a ? `https://yandex.ru/maps/?rtext=~${encodeURIComponent(a)}&rtt=taxi` : ''
}
