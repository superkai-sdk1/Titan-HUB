'use client'
import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, Button, INP, LBL } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface StockItem {
  id: string
  name: string
  stockQuantity: number
  minThreshold: number
  trackStock: boolean
  category?: string
  costPrice?: string | number
}

interface ResultRow { name: string; expected: number; actual: number; diff: number; value: number }
interface Report { surplusCount: number; surplusValue: number; shortageCount: number; shortageValue: number; total: number }

const costOf = (i: { costPrice?: string | number }) => parseFloat(String(i.costPrice ?? 0)) || 0
function fmt(n: number) { return `${Math.round(n).toLocaleString('ru')} ₽` }

// Сводка расхождений: излишек (факт > учёта) и недостача (факт < учёта) — в штуках
// и в деньгах (по себестоимости), плюс общая сумма расхождений (их сумма).
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

export default function RevisionPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [mode, setMode] = useState<'idle' | 'active' | 'done'>('idle')
  // В entries только позиции, ДОБАВЛЕННЫЕ в ревизию вручную (id → введённый факт).
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<ResultRow[]>([])

  const { data, isLoading } = useQuery<{ items: StockItem[] }>({
    queryKey: ['menu-items-inventory'],
    // /inventory отдаёт активные + неактивные (без удалённых) — ревизия видит весь склад.
    queryFn: () => api.get('/inventory'),
  })

  const tracked = useMemo(
    () => (data?.items ?? []).filter(i => i.trackStock),
    [data],
  )

  const patchMut = useMutation({
    mutationFn: ({ id, stockQuantity }: { id: string; stockQuantity: number }) =>
      api.patch(`/inventory/${id}`, { stockQuantity, reason: 'Ревизия' }),
  })

  // Ревизия начинается с ПУСТОГО списка — позиции добавляются вручную поиском.
  function startRevision() {
    setEntries({})
    setQuery('')
    setMode('active')
  }

  async function finishRevision() {
    setSaving(true)
    const res: typeof results = []
    let failed = false
    try {
      // Сохраняем только добавленные в ревизию позиции с валидным фактом.
      for (const item of tracked) {
        const raw = entries[item.id]
        if (raw === '' || raw === undefined) continue
        // FIX #14: не коэрсим мусорный ввод в 0 — это записало бы остаток в 0
        // с большим отрицательным diff. Пропускаем невалидные строки.
        const actual = parseInt(raw, 10)
        if (!Number.isFinite(actual)) continue
        const diff = actual - item.stockQuantity
        // Пишем в результат только после успешного сохранения позиции.
        await patchMut.mutateAsync({ id: item.id, stockQuantity: actual })
        res.push({ name: item.name, expected: item.stockQuantity, actual, diff, value: diff * costOf(item) })
      }
    } catch {
      failed = true
    } finally {
      qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
      setResults(res)
      setSaving(false)
      setMode('done')
    }
    if (failed) {
      show(`Часть позиций не сохранена. Применено: ${res.length}. Повторите для оставшихся.`, 'error')
    }
  }

  const filled = Object.values(entries).filter(v => v !== '').length
  const total = tracked.length
  // Добавленные в ревизию позиции (сохраняем порядок добавления нельзя из Record —
  // сортируем по имени для стабильности) и кандидаты поиска (ещё не добавленные).
  const added = useMemo(() => tracked.filter(i => entries[i.id] !== undefined), [tracked, entries])
  const q = query.trim().toLowerCase()
  const candidates = useMemo(
    () => (q ? tracked.filter(i => entries[i.id] === undefined && i.name.toLowerCase().includes(q)).slice(0, 8) : []),
    [q, tracked, entries],
  )
  function addItem(id: string) {
    setEntries(prev => ({ ...prev, [id]: '' }))
    setQuery('')
  }
  function removeItem(id: string) {
    setEntries(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  // Живой отчёт во время заполнения.
  const activeReport = useMemo(() => buildReport(
    tracked
      .map(item => {
        const raw = entries[item.id]
        if (raw === '' || raw === undefined) return null
        const a = parseInt(raw, 10)
        if (!Number.isFinite(a)) return null
        return { diff: a - item.stockQuantity, cost: costOf(item) }
      })
      .filter((x): x is { diff: number; cost: number } => x !== null),
  ), [tracked, entries])

  // Итоговый отчёт по сохранённым результатам (value = diff × себестоимость).
  const doneReport = useMemo<Report>(() => {
    let sV = 0, shV = 0, sC = 0, shC = 0
    for (const r of results) {
      if (r.diff > 0) { sC++; sV += r.value }
      else if (r.diff < 0) { shC++; shV += -r.value }
    }
    return { surplusCount: sC, surplusValue: sV, shortageCount: shC, shortageValue: shV, total: sV + shV }
  }, [results])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Ревизия"
        subtitle={mode === 'idle' ? `${total} товаров с учётом склада` : mode === 'active' ? (added.length === 0 ? 'Добавьте позиции для ревизии' : `Позиций: ${added.length} · заполнено ${filled}`) : 'Ревизия завершена'}
      />

      <div style={{ padding: '20px 16px var(--bottom-nav-clear, 16px)', flex: 1 }}>

        {isLoading && !data && <StateView state="loading" />}

        {/* Idle state */}
        {mode === 'idle' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Info card */}
            <div className="glass-l2" style={{ borderRadius: 18, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="fact_check" size={24} color="#F59E0B" />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Инвентаризация склада</p>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                    Сравнение фактических остатков с ожидаемыми. Введите реальное количество каждого товара — система автоматически обновит склад.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Товаров с учётом', value: total, color: '#8B5CF6', icon: 'inventory_2' },
                { label: 'Ниже порога', value: tracked.filter(i => i.stockQuantity <= i.minThreshold).length, color: '#F43F5E', icon: 'warning' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className="glass-l2" style={{ borderRadius: 16, padding: '16px 18px' }}>
                  <Icon name={icon} size={22} color={color} />
                  <p style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 2px', color }}>{value}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Preview list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ ...LBL, margin: '0 0 8px' }}>Товары для ревизии</p>
              {tracked.map(item => (
                <div key={item.id} className="glass-l2" style={{ borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Ожидается: {item.stockQuantity} шт · Порог: {item.minThreshold}</p>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                    color: item.stockQuantity <= item.minThreshold ? '#F43F5E' : item.stockQuantity <= item.minThreshold * 2 ? '#F59E0B' : '#10B981',
                  }}>
                    {item.stockQuantity}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={startRevision}
              disabled={total === 0}
              style={{ width: '100%', padding: '15px 0', borderRadius: 14, minHeight: 48, border: 'none', cursor: total === 0 ? 'not-allowed' : 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 2px 10px rgba(0,0,0,0.25)', opacity: total === 0 ? 0.5 : 1 }}
            >
              Начать ревизию
            </button>
          </div>
        )}

        {/* Active state */}
        {mode === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Поиск-добавление позиций в ревизию */}
            <div className="glass-l2" style={{ borderRadius: 16, padding: 14 }}>
              <p style={{ ...LBL, margin: '0 0 8px' }}>Добавить позицию</p>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Название товара…"
                  style={{ ...INP, paddingLeft: 42 }}
                />
              </div>
              {candidates.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {candidates.map(c => (
                    <button key={c.id} onClick={() => addItem(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', color: 'var(--on-surface)', minHeight: 44 }}>
                      <Icon name="add" size={16} color="#a78bfa" />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>склад: {c.stockQuantity}</span>
                    </button>
                  ))}
                </div>
              )}
              {q && candidates.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '8px 2px 0' }}>Ничего не найдено или уже добавлено.</p>
              )}
              {added.length < tracked.length && (
                <button onClick={() => { setEntries(prev => { const next = { ...prev }; tracked.forEach(i => { if (next[i.id] === undefined) next[i.id] = '' }); return next }) }} style={{ marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', color: 'var(--on-surface-variant)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                  Добавить все товары ({tracked.length - added.length})
                </button>
              )}
            </div>

            {added.length > 0 && <ReportCard r={activeReport} />}
            {added.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '8px 2px', textAlign: 'center', lineHeight: 1.5 }}>
                Список пуст. Найдите и добавьте товары, которые ревизируете, — обновятся только они.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '4px 0 4px' }}>
                Введите фактическое количество. Расхождения подсвечиваются, пустые поля не обновляются.
              </p>
            )}
            {added.map(item => {
              const val = entries[item.id] ?? ''
              // FIX #14: невалидный ввод не превращаем в 0 — не показываем фиктивный diff.
              const parsed = val === '' ? null : parseInt(val, 10)
              const actual = parsed !== null && Number.isFinite(parsed) ? parsed : null
              const diff = actual !== null ? actual - item.stockQuantity : null
              const hasDiff = diff !== null && diff !== 0
              const dColor = !hasDiff ? 'var(--on-surface-variant)' : diff! > 0 ? '#34D399' : '#F87171'
              const value = diff !== null ? diff * costOf(item) : 0
              return (
                <div key={item.id} className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', border: hasDiff ? `1px solid ${dColor}66` : '1px solid rgba(255,255,255,0.08)', background: hasDiff ? `${dColor}12` : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace" }}>склад: {item.stockQuantity} шт</span>
                    </div>
                    <div style={{ width: 88, flexShrink: 0 }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="Факт"
                        value={val}
                        onChange={e => setEntries(prev => ({ ...prev, [item.id]: e.target.value }))}
                        style={{ ...INP, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '10px 12px', borderColor: hasDiff ? `${dColor}99` : undefined }}
                      />
                    </div>
                    <button onClick={() => removeItem(item.id)} aria-label={`Убрать ${item.name} из ревизии`} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  {hasDiff && (
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

            {/* Панель завершения: sticky В ПОТОКЕ (не fixed) — занимает своё место
                после списка, ничего не перекрывает; прилипает к низу скролл-контейнера
                и в сплите, и на мобильном (с поправкой на плавающую навигацию). */}
            {added.length > 0 && (
              <div style={{ position: 'sticky', bottom: 'calc(var(--bottom-nav-clear, 0px) + 8px)', zIndex: 45, background: 'rgba(24,21,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '12px 16px', marginTop: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Заполнено: {filled}/{added.length}</span>
                  <span style={{ fontSize: 12, color: '#8B5CF6', fontWeight: 700 }}>{added.length ? Math.round(filled / added.length * 100) : 0}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: 'var(--primary-violet)', width: `${added.length ? Math.round(filled / added.length * 100) : 0}%`, transition: 'width 0.3s' }} />
                </div>
                <button
                  onClick={finishRevision}
                  disabled={saving || filled === 0}
                  style={{ width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, minHeight: 44, border: 'none', cursor: saving || filled === 0 ? 'not-allowed' : 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: filled === 0 ? 0.5 : 1, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
                >
                  {saving ? 'Сохраняем…' : `Завершить ревизию (${filled} позиций)`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Done state */}
        {mode === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon name="check_circle" size={32} color="#10B981" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>Ревизия завершена</h2>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Обновлено {results.length} позиций</p>
            </div>

            <ReportCard r={doneReport} />

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ ...LBL, margin: '0 0 8px' }}>Результаты</p>
                {results.map(r => (
                  <div key={r.name} className="glass-l2" style={{ borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{r.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
                        Было: {r.expected} → Стало: {r.actual}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                      color: r.diff > 0 ? '#10B981' : r.diff < 0 ? '#F43F5E' : 'var(--on-surface-variant)',
                    }}>
                      {r.diff > 0 ? '+' : ''}{r.diff}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { setMode('idle'); setResults([]) }}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, minHeight: 44, border: 'none', cursor: 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
            >
              Новая ревизия
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
