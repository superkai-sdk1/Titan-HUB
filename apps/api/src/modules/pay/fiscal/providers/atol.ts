/**
 * АТОЛ Онлайн (облачная касса 54-ФЗ).
 *
 * Поток: getToken (login/pass → токен на 24ч) → POST /{group}/sell с чеком →
 * uuid операции (АТОЛ фискализирует асинхронно; uuid = принято). Боевой контур
 * online.atol.ru, тестовый — testonline.atol.ru. Суммы — рубли.
 *
 * Конфиг заведения (в integrations): логин/пароль интеграции, group_code (код
 * группы ККТ), ИНН, адрес расчётов, e-mail компании, СНО (режим налогообложения).
 */
import { round2 } from '../../../../lib/money.js'
import type { FiscalProvider, FiscalReceiptInput } from '../types.js'

const VAT_MAP: Record<number, string> = { 1: 'none', 2: 'vat0', 3: 'vat10', 4: 'vat20', 5: 'vat110', 6: 'vat120' }
const VALID_SNO = ['osn', 'usn_income', 'usn_income_outcome', 'envd', 'esn', 'patent']

function baseUrl(test?: boolean): string {
  return test ? 'https://testonline.atol.ru/possystem/v4' : 'https://online.atol.ru/possystem/v4'
}

// АТОЛ ждёт локальное время кассы в формате dd.mm.yyyy HH:MM:SS. Берём МСК (UTC+3),
// не завися от таймзоны контейнера.
function fmtTimestamp(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

export const atolProvider: FiscalProvider = {
  id: 'atol',
  label: 'АТОЛ Онлайн',
  credKeys: ['atol_login', 'atol_password', 'atol_group_code', 'atol_inn', 'atol_payment_address', 'atol_company_email', 'atol_sno'],
  requiredKeys: ['atol_login', 'atol_password', 'atol_group_code', 'atol_inn', 'atol_payment_address'],

  async registerReceipt({ creds, receipt, test }) {
    const base = baseUrl(test)
    const group = creds['atol_group_code']
    if (!creds['atol_login'] || !creds['atol_password'] || !group || !creds['atol_inn'] || !creds['atol_payment_address']) {
      throw new Error('ATOL_NOT_CONFIGURED')
    }

    const tokRes = await fetch(`${base}/getToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: creds['atol_login'], pass: creds['atol_password'] }),
    })
    const tok = (await tokRes.json().catch(() => ({}))) as Record<string, unknown>
    const token = tok['token'] as string | undefined
    if (!token) {
      const err = tok['error'] as Record<string, unknown> | undefined
      throw new Error(`ATOL_TOKEN_FAILED: ${String(err?.['text'] ?? tokRes.status)}`)
    }

    const sno = VALID_SNO.includes(creds['atol_sno'] ?? '') ? creds['atol_sno'] : 'usn_income'
    const client: Record<string, string> = {}
    if (receipt.customerEmail) client['email'] = receipt.customerEmail
    if (receipt.customerPhone) client['phone'] = receipt.customerPhone

    const body = {
      timestamp: fmtTimestamp(),
      external_id: receipt.checkId,
      receipt: {
        client,
        company: {
          email: creds['atol_company_email'] ?? '',
          sno,
          inn: creds['atol_inn'],
          payment_address: creds['atol_payment_address'],
        },
        items: receipt.items.map((it) => ({
          name: it.name.slice(0, 128),
          price: round2(it.price),
          quantity: it.quantity,
          sum: round2(it.price * it.quantity),
          payment_method: 'full_payment',
          payment_object: 'service',
          vat: { type: VAT_MAP[it.vatCode] ?? 'none' },
        })),
        payments: [{ type: receipt.payment === 'cash' ? 0 : 1, sum: round2(receipt.total) }],
        total: round2(receipt.total),
      },
    }

    const sellRes = await fetch(`${base}/${group}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Token': token },
      body: JSON.stringify(body),
    })
    const sell = (await sellRes.json().catch(() => ({}))) as Record<string, unknown>
    const uuid = sell['uuid'] as string | undefined
    if (!uuid) {
      const err = sell['error'] as Record<string, unknown> | undefined
      throw new Error(`ATOL_SELL_FAILED: ${String(err?.['text'] ?? sellRes.status)}`)
    }
    return { externalId: String(uuid) }
  },
}
