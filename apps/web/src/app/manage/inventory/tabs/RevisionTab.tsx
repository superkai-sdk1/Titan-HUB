'use client'
/**
 * Ревизии склада — персистентная история инвентаризаций (вкладка хаба «Склад»).
 *
 * Best practice: слепой подсчёт (blind count) — ожидаемый остаток скрыт во время
 * ввода факта, расхождения показываются только на экране сводки перед коммитом.
 * Снапшот expected фиксируется на бэке при проведении; правка применяет дельту.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { ConfirmDialog, INP, LBL, Toggle } from '@/components/manage/DesignSystem'
import { useUnsavedGuard, type GuardRegistration } from '@/components/manage/UnsavedGuard'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface StockItem {
  id: string
  name: string
  stockQuantity: number
  minThreshold: number
  trackStock: boolean
  costPrice?: string | number
}
interface RevisionSummary {
  id: string
  createdAt: string
  updatedAt: string | null
  author: string | null
  status?: string
  positions: number
  surplusValue: number
  shortageValue: number
}
interface RevisionItem {
  id: string
  itemId: string
  name: string
  expected: number
  actual: number
  costPrice: string | number
  sortOrder: number
}

const costOf = (i: { costPrice?: string | number }) => parseFloat(String(i.costPrice ?? 0)) || 0
function fmt(n: number) { return `${Math.round(n).toLocaleString('ru')} ₽` }
function fmtDate(s: string) {
  try { return format(new Date(s), 'd MMMM yyyy · HH:mm', { locale: ru }) } catch { return s }
}

interface Report { surplusCount: number; surplusValue: number; shortageCount: number; shortageValue: number; total: number }
function buildReport(rows: { diff: number; cost: number }[]): Report {
  let surplusCount = 0, surplusValue = 0, shortageCount = 0, shortageValue = 0
  for (const r of rows) {
    if (r.diff > 0) { surplusCount++; surplusValue += r.diff * r.cost }
    else if (r.diff < 0) { shortageCount++; shortageValue += -r.diff * r.cost }
  }
  return { surplusCount, surplusValue, shortageCount, shortageValue, total: surplusValue + shortageValue }
}

function ReportCard({ r }: { r: Report }) {
  const nothing = r.surplusCount === 0 && r.shortageCount === 0
  return (
    <div className="glass-l2" style={{ borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', margin: '0 0 12px', letterSpacing: '0.02em' }}>СВОДКА РАСХОЖДЕНИЙ</p>
      {nothing ? (
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Расхождений нет — всё сходится.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="trending_up" size={16} color="#34D399" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399' }}>Излишек</span>
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>+{fmt(r.surplusValue)}</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{r.surplusCount} поз.</p>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="trending_down" size={16} color="#F87171" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F87171' }}>Недостача</span>
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#F87171', fontVariantNumeric: 'tabular-nums' }}>−{fmt(r.shortageValue)}</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{r.shortageCount} поз.</p>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Общая сумма расхождений</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total)}</span>
          </div>
        </>
      )}
    </div>
  )
}

export function RevisionTab() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [mode, setMode] = useState<'list' | 'new' | 'view'>('list')
  const [viewId, setViewId] = useState<string | null>(null)

  // Новая ревизия (draftId — если продолжаем сохранённый черновик).
  const [order, setOrder] = useState<string[]>([])
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const { register, attempt } = useUnsavedGuard()
  // Слепой подсчёт: ожидаемое скрыто во время ввода; сводка — отдельным шагом.
  const [blind, setBlind] = useState(true)
  const [revealSummary, setRevealSummary] = useState(false)

  // Правка открытой ревизии.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [confirmEdit, setConfirmEdit] = useState(false)

  const { data: stock } = useQuery<{ items: StockItem[] }>({
    queryKey: ['menu-items-inventory'],
    queryFn: () => api.get('/inventory'),
  })
  const tracked = useMemo(() => (stock?.items ?? []).filter(i => i.trackStock), [stock])
  const itemById = useMemo(() => new Map(tracked.map(i => [i.id, i])), [tracked])

  const { data: listData, isLoading: listLoading } = useQuery<{ revisions: RevisionSummary[] }>({
    queryKey: ['revisions'],
    queryFn: () => api.get('/inventory/revisions'),
  })
  const revList = listData?.revisions ?? []

  const { data: detail, isLoading: detailLoading } = useQuery<{ revision: RevisionSummary & { author: string | null; isLatest: boolean }; items: RevisionItem[] }>({
    queryKey: ['revisions', viewId],
    queryFn: () => api.get(`/inventory/revisions/${viewId}`),
    enabled: !!viewId && mode === 'view',
  })

  function invalidateRev() {
    qc.invalidateQueries({ queryKey: ['revisions'] })
    qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
    qc.invalidateQueries({ queryKey: ['inventory-overview'] })
  }

  const createMut = useMutation({
    mutationFn: (items: { itemId: string; actual: number }[]) => api.post<{ revision: { id: string } }>('/inventory/revisions', { items }),
    onSuccess: (res) => {
      invalidateRev()
      show('Ревизия проведена', 'success')
      setOrder([]); setEntries({}); setQuery(''); setRevealSummary(false); setDraftId(null)
      setViewId(res.revision.id)
      setMode('view')
    },
    onError: () => show('Не удалось провести ревизию — остатки не изменены', 'error'),
  })

  // Применить черновик (draft → applied).
  const applyMut = useMutation({
    mutationFn: ({ id, items }: { id: string; items: { itemId: string; actual: number }[] }) =>
      api.post<{ revision: { id: string } }>(`/inventory/revisions/${id}/apply`, { items }),
    onSuccess: (res) => {
      invalidateRev()
      show('Ревизия проведена', 'success')
      setOrder([]); setEntries({}); setQuery(''); setRevealSummary(false); setDraftId(null)
      setViewId(res.revision.id)
      setMode('view')
    },
    onError: () => show('Не удалось провести ревизию — остатки не изменены', 'error'),
  })

  // Сохранить/обновить черновик (без применения к остаткам).
  const draftMut = useMutation({
    mutationFn: (payload: { id?: string; items: { itemId: string; actual: number | null }[] }) =>
      api.post<{ id: string }>('/inventory/revisions/draft', payload),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['revisions'] }); setDraftId(res.id) },
  })

  const deleteDraftMut = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/revisions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['revisions'] }); show('Черновик удалён', 'success') },
    onError: () => show('Не удалось удалить черновик', 'error'),
  })

  const patchMut = useMutation({
    mutationFn: (items: { id: string; actual: number }[]) => api.patch(`/inventory/revisions/${viewId}`, { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revisions'] })
      qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-overview'] })
      setEdits({})
      show('Остатки пересчитаны по правкам', 'success')
    },
    onError: () => show('Не удалось применить правки', 'error'),
  })

  const added = useMemo(() => order.map(id => itemById.get(id)).filter((x): x is StockItem => !!x), [order, itemById])
  const q = query.trim().toLowerCase()
  const candidates = useMemo(
    () => (q ? tracked.filter(i => !order.includes(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8) : []),
    [q, tracked, order],
  )
  const filled = order.filter(id => {
    const v = entries[id]
    return v !== undefined && v !== '' && Number.isFinite(parseInt(v, 10))
  }).length

  const newReport = useMemo(() => buildReport(
    added.map(item => {
      const raw = entries[item.id]
      if (raw === undefined || raw === '') return null
      const a = parseInt(raw, 10)
      if (!Number.isFinite(a)) return null
      return { diff: a - item.stockQuantity, cost: costOf(item) }
    }).filter((x): x is { diff: number; cost: number } => x !== null),
  ), [added, entries])

  // Показывать расхождения по ходу ввода? Только в обычном режиме или когда сводка раскрыта.
  const showDiffs = !blind || revealSummary

  function startNew() {
    setOrder([]); setEntries({}); setQuery(''); setRevealSummary(false); setDraftId(null)
    setMode('new')
  }
  function clearNew() {
    setOrder([]); setEntries({}); setQuery(''); setRevealSummary(false); setDraftId(null)
    setMode('list')
  }
  function addItem(id: string) {
    setOrder(prev => [id, ...prev])
    setQuery('')
  }
  function removeItem(id: string) {
    setOrder(prev => prev.filter(x => x !== id))
    setEntries(prev => { const next = { ...prev }; delete next[id]; return next })
  }
  // Применить (провести): свежая → create, продолжение черновика → apply.
  function applyItems() {
    const items = order
      .map(id => ({ itemId: id, actual: parseInt(entries[id] ?? '', 10) }))
      .filter(x => Number.isFinite(x.actual) && x.actual >= 0)
    if (items.length === 0) return Promise.resolve()
    return draftId ? applyMut.mutateAsync({ id: draftId, items }) : createMut.mutateAsync(items)
  }
  function submitCreate() { void applyItems() }
  // Сохранить черновик: все добавленные позиции (факт может быть пустым).
  function saveDraft() {
    const items = order.map(id => {
      const v = entries[id]
      const n = v === undefined || v === '' ? NaN : parseInt(v, 10)
      return { itemId: id, actual: Number.isFinite(n) ? n : null }
    })
    return draftMut.mutateAsync({ id: draftId ?? undefined, items })
  }
  // Продолжить сохранённый черновик: префилл из draft_data.
  async function openDraft(id: string) {
    const d = await api.get<{ revision: { draftData?: { items: { itemId: string; actual: number | null }[] } } }>(`/inventory/revisions/${id}`)
    const items = d.revision?.draftData?.items ?? []
    setOrder(items.map(i => i.itemId))
    setEntries(Object.fromEntries(items.filter(i => i.actual != null).map(i => [i.itemId, String(i.actual)])))
    setDraftId(id); setRevealSummary(false); setQuery('')
    setMode('new')
  }

  // Регистрация в guard: «грязно», когда начата ревизия (есть позиции в режиме new).
  const guardRef = useRef<GuardRegistration>({ isDirty: () => false, onSave: () => {}, onDraft: () => {}, onDiscard: () => {}, title: 'ревизию' })
  guardRef.current = {
    isDirty: () => mode === 'new' && order.length > 0,
    onSave: async () => { await applyItems() },
    onDraft: async () => { await saveDraft(); clearNew() },
    onDiscard: () => clearNew(),
    title: 'ревизию',
  }
  useEffect(() => {
    register({
      isDirty: () => guardRef.current.isDirty(),
      onSave: () => guardRef.current.onSave(),
      onDraft: () => guardRef.current.onDraft(),
      onDiscard: () => guardRef.current.onDiscard(),
      title: 'ревизию',
    })
    return () => register(null)
  }, [register])

  const detailItems = detail?.items ?? []
  const editChanges = detailItems
    .map(it => {
      const raw = edits[it.id]
      if (raw === undefined || raw === '') return null
      const a = parseInt(raw, 10)
      if (!Number.isFinite(a) || a < 0 || a === it.actual) return null
      return { id: it.id, actual: a, name: it.name, from: it.actual }
    })
    .filter((x): x is { id: string; actual: number; name: string; from: number } => x !== null)

  const viewReport = useMemo(() => buildReport(
    detailItems.map(it => {
      const raw = edits[it.id]
      const a = raw !== undefined && raw !== '' && Number.isFinite(parseInt(raw, 10)) ? parseInt(raw, 10) : it.actual
      return { diff: a - it.expected, cost: costOf(it) }
    }),
  ), [detailItems, edits])

  function openRevision(id: string) {
    setEdits({})
    setViewId(id)
    setMode('view')
  }
  function backToList() {
    setEdits({})
    setViewId(null)
    setDraftId(null)
    setMode('list')
  }

  return (
    <div>
      {/* Локальная шапка вкладки: назад (внутри ревизии) + действие */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {mode !== 'list' && (
          <button onClick={() => attempt(backToList)} aria-label="К списку ревизий" style={{ width: 40, height: 40, borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
            <Icon name="arrow_back" size={18} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{mode === 'list' ? 'История ревизий' : mode === 'new' ? 'Новая ревизия' : 'Ревизия'}</p>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>
            {mode === 'list' ? (revList.length ? `Ревизий: ${revList.length}` : 'Инвентаризации') : mode === 'new' ? (order.length === 0 ? 'Добавьте позиции' : `Позиций: ${order.length} · заполнено ${filled}`) : detail ? fmtDate(String(detail.revision.createdAt)) : ''}
          </p>
        </div>
        {mode === 'list' && (
          <button onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 13, fontWeight: 700, minHeight: 40, flexShrink: 0 }}>
            <Icon name="add" size={18} color="#fff" /> Новая
          </button>
        )}
      </div>

      {/* Список ревизий */}
      {mode === 'list' && (
        listLoading ? <StateView state="loading" /> :
        revList.length === 0 ? (
          <StateView
            state="empty"
            icon="fact_check"
            title="Ревизий ещё не было"
            description="Проведите первую инвентаризацию — добавьте позиции и сверьте фактические остатки."
            action={{ label: 'Новая ревизия', icon: 'add', onClick: startNew }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {revList.map(r => {
              const isDraft = r.status === 'draft'
              return (
              <div key={r.id} className="glass-l2" style={{ width: '100%', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, border: isDraft ? '1px solid rgba(139,92,246,0.4)' : undefined }}>
                <button onClick={() => isDraft ? openDraft(r.id) : openRevision(r.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--on-surface)', padding: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: isDraft ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={isDraft ? 'edit' : 'fact_check'} size={22} color={isDraft ? '#a78bfa' : '#F59E0B'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {fmtDate(String(r.createdAt))}
                      {isDraft && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 6, background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>черновик</span>}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>
                      {isDraft ? `${r.positions} поз. · продолжить` : `${r.positions} поз.${r.author ? ` · ${r.author}` : ''}${r.updatedAt ? ' · корректировалась' : ''}`}
                    </p>
                  </div>
                  {!isDraft && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {r.surplusValue > 0 && <p style={{ fontSize: 13, fontWeight: 700, color: '#34D399', margin: 0, fontVariantNumeric: 'tabular-nums' }}>+{fmt(r.surplusValue)}</p>}
                      {r.shortageValue > 0 && <p style={{ fontSize: 13, fontWeight: 700, color: '#F87171', margin: 0, fontVariantNumeric: 'tabular-nums' }}>−{fmt(r.shortageValue)}</p>}
                      {r.surplusValue === 0 && r.shortageValue === 0 && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>без расхождений</p>}
                    </div>
                  )}
                </button>
                {isDraft
                  ? <button onClick={() => deleteDraftMut.mutate(r.id)} aria-label="Удалить черновик" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.08)', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="delete" size={16} /></button>
                  : <Icon name="chevron_right" size={18} color="var(--on-surface-variant)" />}
              </div>
              )
            })}
          </div>
        )
      )}

      {/* Новая ревизия */}
      {mode === 'new' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="glass-l2" style={{ borderRadius: 16, padding: 14 }}>
            <p style={{ ...LBL, margin: '0 0 8px' }}>Добавить позицию</p>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Название товара…" style={{ ...INP, paddingLeft: 42 }} />
            </div>
            {candidates.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {candidates.map(c2 => (
                  <button key={c2.id} onClick={() => addItem(c2.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', color: 'var(--on-surface)', minHeight: 44 }}>
                    <Icon name="add" size={16} color="#a78bfa" />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c2.name}</span>
                    {!blind && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>склад: {c2.stockQuantity}</span>}
                  </button>
                ))}
              </div>
            )}
            {q && candidates.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '8px 2px 0' }}>Ничего не найдено или уже добавлено.</p>
            )}
          </div>

          {/* Переключатель слепого подсчёта */}
          <div className="glass-l2" style={{ borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name={blind ? 'visibility_off' : 'visibility'} size={20} color={blind ? '#a78bfa' : 'var(--on-surface-variant)'} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Слепой подсчёт</p>
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0', lineHeight: 1.4 }}>Ожидаемый остаток скрыт — считаете по факту, без подгонки.</p>
            </div>
            <Toggle value={blind} onChange={v => { setBlind(v); setRevealSummary(false) }} ariaLabel="Слепой подсчёт" />
          </div>

          {added.length > 0 && showDiffs && <ReportCard r={newReport} />}
          {added.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '8px 2px', textAlign: 'center', lineHeight: 1.5 }}>
              Список пуст. Найдите и добавьте товары, которые ревизируете, — обновятся только они.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '4px 0 4px' }}>
              Введите фактическое количество. Новые позиции добавляются сверху.
            </p>
          )}

          {added.map(item => {
            const val = entries[item.id] ?? ''
            const parsed = val === '' ? null : parseInt(val, 10)
            const actual = parsed !== null && Number.isFinite(parsed) ? parsed : null
            const diff = actual !== null ? actual - item.stockQuantity : null
            const hasDiff = diff !== null && diff !== 0
            const dColor = !hasDiff ? 'var(--on-surface-variant)' : diff! > 0 ? '#34D399' : '#F87171'
            const value = diff !== null ? diff * costOf(item) : 0
            const rowDiff = showDiffs && hasDiff
            return (
              <div key={item.id} className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', border: rowDiff ? `1px solid ${dColor}66` : '1px solid rgba(255,255,255,0.08)', background: rowDiff ? `${dColor}12` : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                    {showDiffs
                      ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>склад: {item.stockQuantity} шт</span>
                      : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface-variant)' }}>введите фактический остаток</span>}
                  </div>
                  <div style={{ width: 88, flexShrink: 0 }}>
                    <input
                      type="number" min="0" placeholder="Факт" value={val}
                      onChange={e => setEntries(prev => ({ ...prev, [item.id]: e.target.value }))}
                      style={{ ...INP, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '10px 12px', borderColor: rowDiff ? `${dColor}99` : undefined }}
                    />
                  </div>
                  <button onClick={() => removeItem(item.id)} aria-label={`Убрать ${item.name} из ревизии`} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                    <Icon name="close" size={15} />
                  </button>
                </div>
                {rowDiff && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Icon name={diff! > 0 ? 'trending_up' : 'trending_down'} size={15} color={dColor} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>
                      {diff! > 0 ? 'Излишек' : 'Недостача'} {diff! > 0 ? '+' : ''}{diff} шт{value ? ` · ${diff! > 0 ? '+' : '−'}${fmt(Math.abs(value))}` : ''}
                    </span>
                  </div>
                )}
              </div>
            )
          })}

          {added.length > 0 && (
            <div style={{ position: 'sticky', bottom: 'calc(var(--bottom-nav-clear, 0px) + 8px)', zIndex: 45, background: 'rgba(24,21,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '12px 16px', marginTop: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Заполнено: {filled}/{added.length}</span>
                <span style={{ fontSize: 12, color: '#8B5CF6', fontWeight: 700 }}>{added.length ? Math.round(filled / added.length * 100) : 0}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'var(--primary-violet)', width: `${added.length ? Math.round(filled / added.length * 100) : 0}%`, transition: 'width 0.3s' }} />
              </div>
              {/* Слепой подсчёт: сначала «Показать расхождения», затем «Провести» */}
              {blind && !revealSummary ? (
                <button
                  onClick={() => setRevealSummary(true)}
                  disabled={filled === 0}
                  style={{ width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, minHeight: 44, border: '1px solid rgba(139,92,246,0.4)', cursor: filled === 0 ? 'not-allowed' : 'pointer', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', fontSize: 14, fontWeight: 700, opacity: filled === 0 ? 0.5 : 1 }}
                >
                  Показать расхождения ({filled})
                </button>
              ) : (
                <button
                  onClick={() => setConfirmCreate(true)}
                  disabled={createMut.isPending || filled === 0}
                  style={{ width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, minHeight: 44, border: 'none', cursor: createMut.isPending || filled === 0 ? 'not-allowed' : 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: filled === 0 ? 0.5 : 1, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
                >
                  {createMut.isPending ? 'Проводим…' : `Провести ревизию (${filled} позиций)`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Просмотр/правка ревизии */}
      {mode === 'view' && (
        detailLoading || !detail ? <StateView state="loading" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name={detail.revision.isLatest ? 'history' : 'lock'} size={20} color="#F59E0B" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                  {detail.revision.author ? `Провёл: ${detail.revision.author}` : 'Ревизия'}{detail.revision.updatedAt ? ` · корректировалась ${fmtDate(String(detail.revision.updatedAt))}` : ''}
                </p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.45 }}>
                  {detail.revision.isLatest
                    ? 'Правка факта пересчитает текущий остаток на разницу — движения после ревизии сохранятся.'
                    : 'Только просмотр: корректировать можно лишь последнюю ревизию — более новая уже зафиксировала остатки.'}
                </p>
              </div>
            </div>

            <ReportCard r={viewReport} />

            {detailItems.map(it => {
              const raw = edits[it.id]
              const editing = raw !== undefined
              const shown = editing ? raw : String(it.actual)
              const parsed = parseInt(shown, 10)
              const actual = Number.isFinite(parsed) ? parsed : null
              const diff = actual !== null ? actual - it.expected : null
              const hasDiff = diff !== null && diff !== 0
              const dColor = !hasDiff ? 'var(--on-surface-variant)' : diff! > 0 ? '#34D399' : '#F87171'
              const changed = actual !== null && actual !== it.actual
              return (
                <div key={it.id} className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', border: changed ? '1px solid rgba(139,92,246,0.5)' : hasDiff ? `1px solid ${dColor}44` : '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>
                        ожидалось: {it.expected} шт{changed ? ` · было внесено: ${it.actual}` : ''}
                      </span>
                    </div>
                    <div style={{ width: 88, flexShrink: 0 }}>
                      <input
                        type="number" min="0" value={shown}
                        disabled={!detail.revision.isLatest}
                        onChange={e => setEdits(prev => ({ ...prev, [it.id]: e.target.value }))}
                        style={{ ...INP, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '10px 12px', borderColor: changed ? 'rgba(139,92,246,0.7)' : undefined, opacity: detail.revision.isLatest ? 1 : 0.6, cursor: detail.revision.isLatest ? undefined : 'not-allowed' }}
                      />
                    </div>
                  </div>
                  {hasDiff && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Icon name={diff! > 0 ? 'trending_up' : 'trending_down'} size={15} color={dColor} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>
                        {diff! > 0 ? 'Излишек' : 'Недостача'} {diff! > 0 ? '+' : ''}{diff} шт
                      </span>
                    </div>
                  )}
                </div>
              )
            })}

            {detail.revision.isLatest && editChanges.length > 0 && (
              <div style={{ position: 'sticky', bottom: 'calc(var(--bottom-nav-clear, 0px) + 8px)', zIndex: 45, background: 'rgba(24,21,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '12px 16px', marginTop: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
                <button
                  onClick={() => setConfirmEdit(true)}
                  disabled={patchMut.isPending}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 12, minHeight: 44, border: 'none', cursor: patchMut.isPending ? 'not-allowed' : 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
                >
                  {patchMut.isPending ? 'Пересчитываем…' : `Применить правки (${editChanges.length}) и пересчитать остатки`}
                </button>
              </div>
            )}
          </div>
        )
      )}

      <ConfirmDialog
        open={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        onConfirm={() => { setConfirmCreate(false); submitCreate() }}
        title="Провести ревизию?"
        message={`Остатки ${filled} позиций будут установлены по фактическим значениям, каждое изменение попадёт в журнал движений склада. Операция атомарная.`}
        confirmLabel="Провести"
        loading={createMut.isPending}
      />
      <ConfirmDialog
        open={confirmEdit}
        onClose={() => setConfirmEdit(false)}
        onConfirm={() => { setConfirmEdit(false); patchMut.mutate(editChanges.map(x => ({ id: x.id, actual: x.actual }))) }}
        title="Пересчитать остатки?"
        message={`Правок: ${editChanges.length}. Текущие остатки изменятся на разницу между новым и прежним фактом — движения после ревизии сохранятся.`}
        confirmLabel="Применить"
        danger
        loading={patchMut.isPending}
      />
    </div>
  )
}
