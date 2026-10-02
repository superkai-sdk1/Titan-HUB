'use client'
/**
 * Публичное меню для экрана (AbleSign / ТВ) — без авторизации, клуб по поддомену
 * (kbr.titanpos.ru/menu → меню КБР).
 *
 * Рассчитано на обычный HD-телевизор 32″, прежде всего вертикальный (720×1280 /
 * 1080×1920), но работает в любой ориентации. Правила экрана:
 *  • каждая позиция — в одну строку, без переносов;
 *  • занят весь экран: кегль максимально крупный, что поместится, а оставшийся по
 *    высоте запас раздаётся «воздухом» между строками;
 *  • прокрутки нет: если позиций слишком много для читаемого кегля (~2,9% меньшей
 *    стороны экрана, ≈21 px на 720p), страницы сами сменяют друг друга.
 * Число колонок подбирается под экран и длину названий (где кегль крупнее). Слишком
 * длинное название ужимается только у себя (до 75%), а не тянет вниз весь экран.
 *
 * Композиция: разделы меню колонками, внизу — лента «Игровой вечер» + «Кабинки» в двух
 * фиолетовых половинах (мотив шаблона владельца), видна на каждой странице. Без
 * переносов высоты считаются арифметикой от ширин текста (замер один раз при 100 px).
 * Данные обновляются раз в минуту; последний удачный ответ хранится в localStorage —
 * при сбое сети экран не гаснет.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { CategoryIcon } from '@/components/CategoryIcon'

interface MenuItem { name: string; price: number; perHour?: boolean }
interface MenuSection { title: string; icon: string; featured: boolean; items: MenuItem[] }
interface MenuData { clubName: string | null; sections: MenuSection[] }

// Кусок раздела в колонке: раздел целиком или его часть (from..to по позициям).
interface Chunk { sec: number; from: number; to: number }
type Column = Chunk[]
// Ширины текста в em кегля позиции.
interface SectionWidths { title: number; note: number; rows: { name: number; price: number }[] }
interface Page { cols: Column[]; widths: number[] }
interface Plan {
  font: number
  bandFont: number // лента может быть мельче меню, если ей тесно, — но не тянет его вниз
  k: number // множитель «воздуха» (поля строк, отступы разделов)
  pages: Page[]
  reg: SectionWidths[]
  band: SectionWidths[]
  bandWidths: number[] // ширины ячеек ленты, px — по длине их строк
}

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api'
const CACHE_KEY = 'titan_menu_screen'
const POLL_MS = 60_000
const MAX_PAGES = 8

// Вертикальные метрики в em кегля позиции (те же числа — в CSS ниже).
const LINE = 1.2 // строка позиции
const ROW_PAD = 0.17 // поле строки сверху и снизу, ×k
const HEAD_LINE = 1.06 * 1.2 // строка заголовка раздела
const HEAD_PAD = 0.32 * 1.06 // отступ под заголовком, ×k
const SEC_GAP = 1.05 // воздух над заголовком раздела, ×k
const BAND_GAP = 1.1 // между колонками и лентой, ×k
const BAND_PAD_Y = 0.7 + 0.55
const BAND_PAD_X = 0.8 * 2
// Горизонтальные минимумы: точки-лидеры + поля; иконка, зазоры и черта заголовка.
const DOTS_MIN = 0.6 + 0.3 * 2
const HEAD_FIXED = 1.06 * (1.1 + 0.45 + 0.45 + 0.2 + 0.4)
const NOTE_GAP = 1.06 * 0.45
const FIT_MIN = 0.8 // длинное название ужимается не сильнее
const K_MAX = 2.2
// Кегль позиции в u (1% меньшей стороны экрана).
const FONT_MAX_U = 7
const FONT_MIN_U = 2.9 // ниже — уже мелко для ТВ: не ужимаем, а листаем страницы
const SAFETY = 0.992 // запас на субпиксельное округление

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const priceText = (p: number) => `${money.format(p)} ₽`
const isPerHour = (s: MenuSection) => s.items.length > 0 && s.items.every((it) => it.perHour)

function geometry(w: number, h: number) {
  const u = Math.min(w, h) / 100
  // Поля ≥4% — запас на overscan телевизора (часть ТВ обрезает края картинки).
  const padX = 4 * u
  const top = 12.6 * u
  const bottom = 3.6 * u
  return { u, padX, gap: 3 * u, contentW: w - 2 * padX, top, avail: (h - top - bottom) * SAFETY }
}
type Geo = ReturnType<typeof geometry>

const rowEm = (k: number) => LINE + 2 * ROW_PAD * k
const headEm = (k: number) => HEAD_LINE + HEAD_PAD * k

// Раскладка разделов по колонкам высотой limit (em, при k = 1). atomic: раздел, который
// не влезает в остаток колонки, но целиком влезает в пустую, переносится целиком.
// Иначе режется: первый кусок — не меньше двух позиций, и без одинокой позиции в конце.
function pack(sizes: number[], limit: number, atomic: boolean): Column[] | null {
  const head = headEm(1)
  const row = rowEm(1)
  const cols: Column[] = [[]]
  let used = 0
  const cur = () => cols[cols.length - 1]!
  const newCol = () => { cols.push([]); used = 0 }
  for (let si = 0; si < sizes.length; si++) {
    const n = sizes[si]!
    const whole = head + n * row
    const lead = cur().length ? SEC_GAP : 0
    if (used + lead + whole <= limit) { used += lead + whole; cur().push({ sec: si, from: 0, to: n }); continue }
    if (atomic && whole <= limit && cur().length) { newCol(); used = whole; cur().push({ sec: si, from: 0, to: n }); continue }
    let j = 0
    while (j < n) {
      const lg = cur().length ? SEC_GAP : 0
      let k = Math.min(n, j + Math.max(0, Math.floor((limit - used - lg - head) / row)))
      if (k < n && n - k === 1 && k - j > 2) k--
      if (k - j < Math.min(2, n - j)) {
        if (cur().length) { newCol(); continue }
        if (k === j) return null // позиция выше пустой колонки
      }
      used += lg + head + (k - j) * row
      cur().push({ sec: si, from: j, to: k })
      j = k
      if (j < n) newCol()
    }
  }
  return cols
}

// Высота ленты в em её кегля: базовая часть a и коэффициент b при k — по самой длинной ячейке.
function bandEm(band: MenuSection[]) {
  if (band.length === 0) return { a: 0, b: 0 }
  const n = Math.max(...band.map((s) => s.items.length))
  return { a: BAND_PAD_Y + HEAD_LINE + n * LINE, b: HEAD_PAD + 2 * ROW_PAD * n + BAND_GAP }
}

// Ужатие по ширине: 1, если влезает; меньше — во сколько раз ужать текст
// (с запасом 0,04em на субпиксельное округление).
const fitRow = (r: { name: number; price: number }, widthEm: number) =>
  Math.min(1, (widthEm - 0.04 - DOTS_MIN - r.price) / r.name)
const fitHead = (s: SectionWidths, widthEm: number) =>
  Math.min(1, (widthEm - 0.04 - HEAD_FIXED - (s.note ? NOTE_GAP + s.note : 0)) / s.title)

// Ширина раздела в em: самая длинная строка при ужатии названий до fit.
function needOf(s: SectionWidths, fit: number) {
  let n = HEAD_FIXED + (s.note ? NOTE_GAP + s.note : 0) + s.title * fit
  for (const r of s.rows) n = Math.max(n, DOTS_MIN + r.price + r.name * fit)
  return n
}

// Делит ширину room между блоками: полная ширина (без ужатия), где хватает; иначе —
// минимум (с ужатием), а остаток закрывает сперва самые мелкие нехватки — чтобы
// ужатыми остались только по-настоящему длинные строки. fw — предельный кегль;
// длинные названия ужимаются, только если это даёт заметно (>12%) крупнее кегль.
function allocate(full: number[], min: number[], room: number) {
  const sumF = full.reduce((a, b) => a + b, 0)
  const sumM = min.reduce((a, b) => a + b, 0)
  const order = full.map((_, i) => i).sort((a, b) => (full[a]! - min[a]!) - (full[b]! - min[b]!))
  const fMin = room / sumM
  let fw = room / sumF
  if (fw < fMin * 0.88) {
    // Без ужатия выходит заметно мельче. Тогда блоки с мелкой нехваткой всё равно
    // даём во всю ширину, пока кегль теряет не больше ~7%: пусть ужимаются только
    // по-настоящему длинные строки, а не полколонки.
    fw = fMin
    let need = sumM
    for (const i of order) {
      need += full[i]! - min[i]!
      if (room / need < fMin * 0.93) break
      fw = room / need
    }
  }
  const at = (f: number) => {
    if (sumF * f <= room) return full.map((x) => x * f + (room - sumF * f) * (x / sumF))
    const widths = min.map((m) => m * f)
    let extra = room - sumM * f
    for (const i of order) {
      const add = Math.min(extra, (full[i]! - min[i]!) * f)
      widths[i]! += add
      extra -= add
    }
    return widths
  }
  return { fw, at }
}

function plan(reg: SectionWidths[], band: SectionWidths[], bandSecs: MenuSection[], geo: Geo): Plan {
  const sizes = reg.map((s) => s.rows.length)
  const needFull = reg.map((s) => needOf(s, 1))
  const needMin = reg.map((s) => needOf(s, FIT_MIN))
  const be = bandEm(bandSecs)
  const fMax = FONT_MAX_U * geo.u
  const fMin = FONT_MIN_U * geo.u
  // Ячейки ленты делят ширину по длине своих строк.
  const bandAlloc = band.length
    ? allocate(band.map((s) => needOf(s, 1) + BAND_PAD_X), band.map((s) => needOf(s, FIT_MIN) + BAND_PAD_X), geo.contentW)
    : null
  const bandFont = (f: number) => Math.min(f, bandAlloc ? bandAlloc.fw : Infinity)
  const limitEm = (f: number) => (geo.avail - bandFont(f) * (be.a + be.b)) / f

  // Колонки страницы делят ширину пропорционально своим самым длинным строкам —
  // напиткам с длинными названиями шире, снекам уже. fw — предельный кегль по ширине.
  const layoutPage = (cols: Column[]) => allocate(
    cols.map((col) => Math.max(1, ...col.map((ch) => needFull[ch.sec]!))),
    cols.map((col) => Math.max(1, ...col.map((ch) => needMin[ch.sec]!))),
    geo.contentW - (cols.length - 1) * geo.gap,
  )
  const split = (cols: Column[], c: number) => {
    const pages: Column[][] = []
    for (let i = 0; i < cols.length; i += c) pages.push(cols.slice(i, i + c))
    return pages
  }
  const widthLimit = (cols: Column[], c: number) => Math.min(...split(cols, c).map((pg) => layoutPage(pg).fw))

  // Наибольший кегль для c колонок × P страниц: влезает по высоте и по ширине.
  const best = (c: number, P: number, atomic: boolean) => {
    const ok = (f: number) => {
      const limit = limitEm(f)
      const p = limit > 0 ? pack(sizes, limit, atomic) : null
      return !!p && p.length <= c * P && f <= widthLimit(p, c)
    }
    if (!ok(1)) return 0
    let lo = 1
    let hi = fMax
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid }
    return lo
  }

  let pick: { f: number; c: number; atomic: boolean } | null = null
  if (sizes.length === 0) {
    pick = { f: Math.min(fMax, be.a + be.b > 0 ? geo.avail / (be.a + be.b) : fMax), c: 1, atomic: true }
  } else {
    for (let P = 1; P <= MAX_PAGES; P++) {
      let top: { f: number; c: number; atomic: boolean; score: number } | null = null
      for (const c of [1, 2, 3, 4]) {
        for (const atomic of [true, false]) {
          const f = best(c, P, atomic)
          // Лёгкое предпочтение целым разделам (до 3% кегля).
          const score = f * (atomic ? 1.03 : 1)
          if (!top || score > top.score) top = { f, c, atomic, score }
        }
      }
      if (!pick || top!.f > pick.f * 1.01) pick = top
      // Читаемо — хватит; лишняя страница почти не прибавляет кегля — тоже.
      if (pick!.f >= fMin || (P > 1 && top!.f <= pick!.f * 1.01 && pick !== top)) break
    }
  }
  const { c, atomic } = pick!
  let f = pick!.f

  // Балансировка: минимальная высота колонки при том же числе страниц — колонки
  // (и страницы) заполняются ровно. Целые разделы при этом не режем. Если ровная
  // раскладка заметно мельче по ширине — остаёмся на исходной.
  const limit = limitEm(f)
  const base = (sizes.length ? pack(sizes, limit, atomic) ?? pack(sizes, limit, false) : []) ?? []
  const capacity = Math.max(1, Math.ceil(base.length / c)) * c
  const tallest = Math.max(0, ...sizes.map((n) => headEm(1) + n * rowEm(1)))
  let lo = atomic ? Math.min(limit, tallest) : 0
  let hi = limit
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const p = pack(sizes, mid, atomic)
    if (p && p.length <= capacity) hi = mid
    else lo = mid
  }
  const even = sizes.length ? pack(sizes, hi, atomic) : null
  const cols = even && widthLimit(even, c) >= f * 0.97 ? even : base
  if (cols.length) f = Math.min(f, widthLimit(cols, c))
  const pages: Page[] = split(cols, c).map((pg) => ({ cols: pg, widths: layoutPage(pg).at(f) }))
  if (pages.length === 0) pages.push({ cols: [], widths: [] })
  const fb = bandFont(f)

  // Воздух: самая высокая колонка (+ лента) ровно до низа экрана.
  let k = K_MAX
  for (const col of cols) {
    let a = 0
    let b = 0
    col.forEach((ch, i) => {
      const n = ch.to - ch.from
      a += HEAD_LINE + n * LINE
      b += HEAD_PAD + 2 * ROW_PAD * n + (i ? SEC_GAP : 0)
    })
    k = Math.min(k, (geo.avail - a * f - be.a * fb) / (b * f + be.b * fb))
  }
  k = Math.max(1, k)

  return { font: f, bandFont: fb, k, pages, reg, band, bandWidths: bandAlloc ? bandAlloc.at(fb) : [] }
}

// Ширины текста — по скрытой «линейке» при 100 px той же вёрсткой (веса, кегли).
function readWidths(root: HTMLElement): SectionWidths[] {
  const w = (el: Element | null) => (el ? (el as HTMLElement).getBoundingClientRect().width / 100 : 0)
  return Array.from(root.children).map((sec) => ({
    title: w(sec.querySelector('.ms-head-t')),
    note: w(sec.querySelector('.ms-note')),
    rows: Array.from(sec.querySelectorAll('.ms-ruler-row')).map((r) => ({
      name: Math.max(0.01, w(r.querySelector('.ms-name'))),
      price: w(r.querySelector('.ms-price')),
    })),
  }))
}

function Ruler({ sections, inBand, rootRef }: { sections: MenuSection[]; inBand: boolean; rootRef: Ref<HTMLDivElement> }) {
  return (
    <div ref={rootRef} className={`ms-measure ms-ruler${inBand ? ' ms-band' : ''}`} aria-hidden>
      {sections.map((s, si) => (
        <div key={si} className={inBand ? 'ms-cell' : undefined}>
          <div className="ms-head"><span className="ms-head-t">{s.title}</span>{isPerHour(s) && <span className="ms-note">за час</span>}</div>
          {s.items.map((it, i) => (
            <div key={i} className="ms-ruler-row"><span className="ms-name">{it.name}</span><span className="ms-price">{priceText(it.price)}</span></div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const t = setInterval(tick, 10_000)
    return () => clearInterval(t)
  }, [])
  if (!now) return null
  return <span className="ms-clock">{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
}

const fitStyle = (fit: number | undefined) => (fit !== undefined && fit < 0.999 ? { fontSize: `${Math.max(FIT_MIN, fit)}em` } : undefined)

function SectionHead({ s, fit }: { s: MenuSection; fit?: number }) {
  // Цена за час — один раз в заголовке, а не «₽/час» в каждой строке.
  return (
    <div className="ms-head">
      <span className="ms-ico"><CategoryIcon icon={s.icon} size={24} color="currentColor" /></span>
      <span className="ms-head-t" style={fitStyle(fit)}>{s.title}</span>
      <span className="ms-rule" />
      {isPerHour(s) && <span className="ms-note">за час</span>}
    </div>
  )
}

function ItemRow({ it, fit }: { it: MenuItem; fit?: number }) {
  return (
    <div className="ms-item">
      <span className="ms-name" style={fitStyle(fit)}>{it.name}</span>
      <span className="ms-dots" />
      <span className="ms-price">{priceText(it.price)}</span>
    </div>
  )
}

export default function MenuScreen() {
  const [raw, setRaw] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  const [fontTick, setFontTick] = useState(0)
  const [layout, setLayout] = useState<{ plan: Plan; v: number } | null>(null)
  const [page, setPage] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const regRulerRef = useRef<HTMLDivElement>(null)
  const bandRulerRef = useRef<HTMLDivElement>(null)

  // Данные: сначала кэш (экран сразу с меню), затем сеть; опрос раз в минуту.
  // Состояние меняется только при реальном изменении меню — без лишних перерисовок.
  useEffect(() => {
    let alive = true
    try { const c = localStorage.getItem(CACHE_KEY); if (c) setRaw(c) } catch { /* приватный режим */ }
    const load = async () => {
      try {
        const r = await fetch(`${API}/menu/public`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const text = JSON.stringify(await r.json())
        if (!alive) return
        setRaw((prev) => (prev === text ? prev : text))
        setFailed(false)
        try { localStorage.setItem(CACHE_KEY, text) } catch { /* */ }
      } catch {
        if (alive) setFailed(true)
      }
    }
    load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const data = useMemo<MenuData | null>(() => {
    try { return raw ? (JSON.parse(raw) as MenuData) : null } catch { return null }
  }, [raw])

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Inter подгружается асинхронно — после загрузки ширины текста меняются, пересчитываем.
  useEffect(() => {
    const fonts = document.fonts
    if (!fonts) return
    const bump = () => setFontTick((t) => t + 1)
    fonts.ready.then(bump)
    fonts.addEventListener?.('loadingdone', bump)
    return () => fonts.removeEventListener?.('loadingdone', bump)
  }, [])

  const geo = useMemo(() => (vp ? geometry(vp.w, vp.h) : null), [vp])

  // Лента внизу — акцентные разделы (тарифы, кабинки); остальное — колонками.
  const { band, sections } = useMemo(() => {
    const all = data?.sections ?? []
    return { band: all.filter((s) => s.featured), sections: all.filter((s) => !s.featured) }
  }, [data])

  useLayoutEffect(() => {
    if (!geo || !regRulerRef.current || (sections.length === 0 && band.length === 0)) { setLayout(null); return }
    const next = plan(
      readWidths(regRulerRef.current),
      bandRulerRef.current ? readWidths(bandRulerRef.current) : [],
      band,
      geo,
    )
    setLayout((prev) => (prev && JSON.stringify(prev.plan) === JSON.stringify(next) ? prev : { plan: next, v: (prev?.v ?? 0) + 1 }))
  }, [sections, band, geo, fontTick])

  const p = layout?.plan
  const pages = p?.pages ?? []
  const pageIdx = Math.min(page, Math.max(0, pages.length - 1))
  const current = pages[pageIdx]?.cols ?? []
  const widths = pages[pageIdx]?.widths ?? []
  const itemsOnPage = current.reduce((a, col) => a + col.reduce((b, ch) => b + ch.to - ch.from, 0), 0)
  // На страницу — 8 с + 0,35 с на позицию (успеть найти своё), в пределах 10–22 с.
  const pageMs = Math.min(22_000, Math.max(10_000, 8_000 + itemsOnPage * 350))

  useEffect(() => {
    if (pages.length < 2) { setPage(0); setLeaving(false); return }
    const t1 = setTimeout(() => setLeaving(true), pageMs - 400)
    const t2 = setTimeout(() => { setLeaving(false); setPage((x) => (x + 1) % pages.length) }, pageMs)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [pages.length, pageIdx, pageMs, layout?.v])

  const empty = data && sections.length === 0 && band.length === 0
  let order = 0

  return (
    <div className="ms-root" style={{ fontSize: geo ? `${geo.u}px` : undefined }}>
      <style>{CSS}</style>
      <div className="ms-bg" aria-hidden>
        <div className="ms-blob ms-blob-a" />
        <div className="ms-blob ms-blob-b" />
        <div className="ms-blob ms-blob-c" />
        <div className="ms-vignette" />
      </div>

      {geo && (
        <>
          <header className="ms-header" style={{ left: geo.padX, right: geo.padX }}>
            <div className="ms-brand">
              <h1 className="ms-title">Меню</h1>
              {data?.clubName && <span className="ms-club">{data.clubName}</span>}
            </div>
            <div className="ms-meta">
              {pages.length > 1 && (
                <div className="ms-pages" aria-hidden>
                  {pages.map((_, i) => (
                    <span key={i} className="ms-seg">
                      <span
                        key={`${i}-${pageIdx}-${layout?.v}`}
                        className={`ms-seg-fill${i < pageIdx ? ' done' : i === pageIdx ? ' run' : ''}`}
                        style={i === pageIdx ? { animationDuration: `${pageMs}ms` } : undefined}
                      />
                    </span>
                  ))}
                </div>
              )}
              <Clock />
            </div>
          </header>

          <main
            className="ms-body"
            style={{ top: geo.top, left: geo.padX, right: geo.padX, height: geo.avail / SAFETY, ...(p ? { fontSize: p.font, ['--k' as string]: p.k } : {}) }}
          >
            {p && (
              <div className="ms-row" style={{ gap: geo.gap }}>
                {current.map((col, ci) => (
                  <div key={`${layout!.v}-${pageIdx}-${ci}`} className="ms-col" style={{ width: widths[ci] }}>
                    {col.map((ch, ki) => {
                      const s = sections[ch.sec]
                      const sw = p.reg[ch.sec]
                      if (!s || !sw) return null
                      const wEm = (widths[ci] ?? 0) / p.font
                      // Каскад: слева направо, сверху вниз (≤0,6 с суммарно).
                      const delay = Math.min(0.6, 0.15 + ci * 0.12 + ki * 0.07 + order++ * 0.01)
                      return (
                        <section
                          key={`${ch.sec}-${ch.from}`}
                          className={`ms-sec${ki ? ' gap' : ''} ${leaving ? 'out' : 'in'}`}
                          style={leaving ? undefined : { animationDelay: `${delay.toFixed(2)}s` }}
                        >
                          <SectionHead s={s} fit={fitHead(sw, wEm)} />
                          {s.items.slice(ch.from, ch.to).map((it, i) => {
                            const r = sw.rows[ch.from + i]
                            return <ItemRow key={ch.from + i} it={it} fit={r ? fitRow(r, wEm) : 1} />
                          })}
                        </section>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
            {p && band.length > 0 && (
              <div key={`band-${layout!.v}`} className="ms-band" style={{ fontSize: p.bandFont }}>
                {band.map((s, i) => {
                  const sw = p.band[i]
                  const w = p.bandWidths[i] ?? 0
                  const wEm = w / p.bandFont - BAND_PAD_X
                  return (
                    <div key={i} className="ms-cell" style={{ width: w }}>
                      <SectionHead s={s} fit={sw ? fitHead(sw, wEm) : 1} />
                      {s.items.map((it, j) => {
                        const r = sw?.rows[j]
                        return <ItemRow key={j} it={it} fit={r ? fitRow(r, wEm) : 1} />
                      })}
                    </div>
                  )
                })}
                <span className="ms-sheen" aria-hidden />
              </div>
            )}
            {!p && (
              <div className="ms-empty">
                {empty ? 'Меню скоро появится' : failed && !data ? 'Меню обновляется…' : ''}
              </div>
            )}
          </main>

          {/* Невидимые «линейки» для замера ширин текста (та же вёрстка, 100 px). */}
          <Ruler sections={sections} inBand={false} rootRef={regRulerRef} />
          {band.length > 0 && <Ruler sections={band} inBand rootRef={bandRulerRef} />}
        </>
      )}
    </div>
  )
}

// Анимации — только transform/opacity: дёшево для слабых ТВ-плееров.
const CSS = `
.ms-root {
  position: fixed; inset: 0; z-index: 200; overflow: hidden;
  background: #0f0b17; color: #f3eef8;
  font-family: Inter, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  user-select: none; cursor: default;
  --head: #c4b5fd; --rule: rgba(167,139,250,.32); --name: #ede7f5; --dots: rgba(204,195,216,.3);
}
.ms-bg { position: absolute; inset: 0; pointer-events: none; }
.ms-blob { position: absolute; width: 90vmax; height: 90vmax; border-radius: 50%; will-change: transform; }
.ms-blob-a { left: -40vmax; top: -50vmax; background: radial-gradient(circle, rgba(140,82,255,.34) 0%, rgba(140,82,255,0) 62%); animation: ms-drift-a 46s ease-in-out infinite alternate; }
.ms-blob-b { right: -45vmax; bottom: -55vmax; background: radial-gradient(circle, rgba(94,23,235,.5) 0%, rgba(94,23,235,0) 64%); animation: ms-drift-b 58s ease-in-out infinite alternate; }
.ms-blob-c { left: 20vw; top: 25vh; width: 60vmax; height: 60vmax; background: radial-gradient(circle, rgba(76,215,246,.07) 0%, rgba(76,215,246,0) 60%); animation: ms-drift-c 70s ease-in-out infinite alternate; }
.ms-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, rgba(15,11,23,0) 50%, rgba(8,6,13,.7) 100%); }

.ms-header { position: absolute; top: 3em; display: flex; align-items: flex-end; justify-content: space-between; gap: 2em; }
.ms-brand { display: flex; align-items: baseline; gap: 1.6em; min-width: 0; }
.ms-title { margin: 0; font-size: 6.6em; line-height: 1; font-weight: 800; letter-spacing: -.02em; color: #fffcf8; text-transform: uppercase; animation: ms-rise .8s cubic-bezier(.16,1,.3,1) both; }
.ms-club { font-size: 2.3em; font-weight: 700; letter-spacing: .3em; text-transform: uppercase; color: #a78bfa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: ms-rise .8s .1s cubic-bezier(.16,1,.3,1) both; }
.ms-meta { display: flex; align-items: center; gap: 2.2em; padding-bottom: .45em; }
.ms-clock { font-size: 3.6em; font-weight: 600; color: rgba(243,238,248,.75); font-variant-numeric: tabular-nums; }
.ms-pages { display: flex; gap: .9em; }
.ms-seg { width: 4.4em; height: .6em; border-radius: 1em; background: rgba(255,255,255,.16); overflow: hidden; }
.ms-seg-fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: #a78bfa; transform: scaleX(0); transform-origin: left center; }
.ms-seg-fill.done { transform: none; }
.ms-seg-fill.run { animation-name: ms-fill; animation-timing-function: linear; animation-fill-mode: both; }

.ms-body { position: absolute; display: flex; flex-direction: column; justify-content: space-between; --k: 1; }
.ms-row { display: flex; align-items: flex-start; }
.ms-col { display: flex; flex-direction: column; flex-shrink: 0; }
.ms-empty { margin: auto 0; text-align: center; font-size: 4em; font-weight: 600; color: rgba(243,238,248,.6); }
.ms-measure { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; }
.ms-ruler { font-size: 100px; white-space: nowrap; animation: none !important; box-shadow: none !important; }
.ms-ruler .ms-head, .ms-ruler .ms-ruler-row { display: block; }
.ms-ruler .ms-head-t, .ms-ruler .ms-note, .ms-ruler .ms-name, .ms-ruler .ms-price { display: inline-block; width: max-content; max-width: none; overflow: visible; }

.ms-sec.gap { margin-top: calc(1.05em * var(--k)); }
.ms-sec.in { animation: ms-sec-in .65s cubic-bezier(.16,1,.3,1) both; }
.ms-sec.out { animation: ms-sec-out .35s cubic-bezier(.4,0,1,1) both; }

/* Лента внизу: две фиолетовые половины из шаблона владельца. */
.ms-band {
  position: relative; display: flex; overflow: hidden; border-radius: .8em; flex-shrink: 0;
  box-shadow: 0 .6em 2em rgba(40,10,110,.45);
  animation: ms-band-in .9s .3s cubic-bezier(.16,1,.3,1) both;
  --head: rgba(255,255,255,.92); --rule: rgba(255,255,255,.35); --name: #fff; --dots: rgba(255,255,255,.5);
}
.ms-cell { flex: none; box-sizing: border-box; min-width: 0; padding: .7em .8em .55em; background: #5e17eb; }
.ms-cell:first-child { background: #8c52ff; }
.ms-cell .ms-name { font-weight: 600; }
.ms-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.17) 50%, rgba(255,255,255,0) 62%); transform: translateX(-110%); animation: ms-sheen 10s 3s cubic-bezier(.45,0,.25,1) infinite; }

.ms-head { display: flex; align-items: center; gap: .45em; padding-bottom: calc(.32em * var(--k)); font-size: 1.06em; line-height: 1.2; font-weight: 700; letter-spacing: -.005em; color: var(--head); white-space: nowrap; }
.ms-ico { flex: 0 0 auto; width: 1.1em; height: 1.1em; display: inline-flex; }
.ms-ico svg { width: 100%; height: 100%; }
.ms-head-t { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ms-rule { flex: 1 1 .4em; height: 1px; margin-left: .2em; background: var(--rule); }
.ms-note { flex: 0 0 auto; font-size: .74em; font-weight: 600; opacity: .8; }

.ms-item { display: flex; align-items: baseline; padding: calc(.17em * var(--k)) 0; line-height: 1.2; white-space: nowrap; }
.ms-name { flex: 0 1 auto; min-width: 0; font-weight: 500; color: var(--name); overflow: hidden; text-overflow: ellipsis; }
.ms-dots { flex: 1 0 .6em; align-self: flex-end; height: 0; margin: 0 .3em .3em; border-bottom: .12em dotted var(--dots); }
.ms-price { flex: 0 0 auto; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }

@keyframes ms-rise { from { opacity: 0; transform: translate3d(0, .3em, 0); } to { opacity: 1; transform: none; } }
@keyframes ms-band-in { from { opacity: 0; transform: translate3d(0, .8em, 0) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes ms-sec-in { from { opacity: 0; transform: translate3d(0, 1em, 0); } to { opacity: 1; transform: none; } }
@keyframes ms-sec-out { to { opacity: 0; transform: translate3d(0, -.5em, 0); } }
@keyframes ms-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ms-sheen { 0%, 72% { transform: translateX(-110%); } 100% { transform: translateX(110%); } }
@keyframes ms-drift-a { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(14vmax, 12vmax, 0) scale(1.12); } }
@keyframes ms-drift-b { from { transform: translate3d(0, 0, 0) scale(1.08); } to { transform: translate3d(-14vmax, -10vmax, 0) scale(.94); } }
@keyframes ms-drift-c { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-18vw, -14vh, 0); } }

/* Меньше движения: без дрейфа, блика и сдвигов — смена страниц остаётся плавной (opacity). */
@media (prefers-reduced-motion: reduce) {
  .ms-blob, .ms-sheen { animation: none; }
  .ms-title, .ms-club, .ms-band, .ms-sec.in { animation-name: ms-fade; }
  .ms-sec.out { animation-name: ms-fade-out; }
}
@keyframes ms-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ms-fade-out { to { opacity: 0; } }
`
