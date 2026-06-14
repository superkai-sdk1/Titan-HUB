import { profiles, ilike, or, sql } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Умный поиск игроков/клиентов: варианты запроса с учётом
//  1) РАСКЛАДКИ клавиатуры (ЙЦУКЕН ↔ QWERTY по физическим клавишам, обе стороны):
//     «Минахор» ↔ «Vbyf[jh».
//  2) ТРАНСЛИТЕРАЦИИ (фонетика, обе стороны): «Минахор» ↔ «Minahor».
// Каждый вариант ищется подстрокой по нику, имени, нику в Telegram и тегам
// (в т.ч. gmnick:<ник на GoMafia>). Серверная сторона — работает и в списке
// клиентов (с пагинацией), и в подборе на кассе.
// ─────────────────────────────────────────────────────────────────────────────

// EN-клавиша → RU-символ на той же физической клавише.
const EN_TO_RU: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю',
}
const RU_TO_EN: Record<string, string> = Object.fromEntries(Object.entries(EN_TO_RU).map(([en, ru]) => [ru, en]))

const swapEnToRu = (s: string): string => s.split('').map((c) => EN_TO_RU[c] ?? c).join('')
const swapRuToEn = (s: string): string => s.split('').map((c) => RU_TO_EN[c] ?? c).join('')

// Латиница → кириллица (фонетика). Диграфы — раньше одиночных.
function latinToRu(s: string): string {
  return s
    .replace(/shch/g, 'щ').replace(/sch/g, 'щ').replace(/sh/g, 'ш')
    .replace(/zh/g, 'ж').replace(/ch/g, 'ч').replace(/ts/g, 'ц').replace(/kh/g, 'х')
    .replace(/ya/g, 'я').replace(/yu/g, 'ю').replace(/yo/g, 'ё').replace(/ye/g, 'е')
    .replace(/a/g, 'а').replace(/b/g, 'б').replace(/v/g, 'в').replace(/g/g, 'г')
    .replace(/d/g, 'д').replace(/e/g, 'е').replace(/z/g, 'з').replace(/i/g, 'и')
    .replace(/y/g, 'й').replace(/k/g, 'к').replace(/l/g, 'л').replace(/m/g, 'м')
    .replace(/n/g, 'н').replace(/o/g, 'о').replace(/p/g, 'п').replace(/r/g, 'р')
    .replace(/s/g, 'с').replace(/t/g, 'т').replace(/u/g, 'у').replace(/f/g, 'ф')
    .replace(/h/g, 'х').replace(/c/g, 'ц').replace(/j/g, 'дж').replace(/w/g, 'в').replace(/x/g, 'кс')
}

// Кириллица → латиница (фонетика).
const RU_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const ruToLatin = (s: string): string => s.split('').map((c) => RU_TO_LAT[c] ?? c).join('')

// Набор вариантов запроса (≤ ~5, дедуп).
export function searchVariants(q: string): string[] {
  const base = (q ?? '').trim().toLowerCase()
  if (!base) return []
  const out = new Set<string>([base])
  out.add(swapEnToRu(base))
  out.add(swapRuToEn(base))
  out.add(latinToRu(base))
  out.add(ruToLatin(base))
  return [...out].filter((v) => v.length > 0)
}

// Условие совпадения по «именным» полям: ник, имя, ник в Telegram.
export function profileNameCondition(q: string) {
  const vs = searchVariants(q)
  if (!vs.length) return undefined
  const conds = vs.flatMap((v) => {
    const p = `%${v}%`
    return [ilike(profiles.nickname, p), ilike(profiles.fullName, p), ilike(profiles.tgUsername, p)]
  })
  return or(...conds)
}

// Условие совпадения по тегам (в т.ч. gmnick:<ник GoMafia>).
export function profileTagCondition(q: string) {
  const vs = searchVariants(q)
  if (!vs.length) return undefined
  const conds = vs.map((v) => sql`lower(tag) like ${`%${v}%`}`)
  return sql`exists (select 1 from unnest(${profiles.searchTags}) as tag where ${sql.join(conds, sql` or `)})`
}
