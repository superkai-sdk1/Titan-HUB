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
}

interface RevisionEntry {
  id: string
  actualQty: string
}

export default function RevisionPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [mode, setMode] = useState<'idle' | 'active' | 'done'>('idle')
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<{ name: string; expected: number; actual: number; diff: number }[]>([])

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

  function startRevision() {
    const init: Record<string, string> = {}
    tracked.forEach(i => { init[i.id] = '' })
    setEntries(init)
    setMode('active')
  }

  async function finishRevision() {
    setSaving(true)
    const res: typeof results = []
    let failed = false
    try {
      for (const item of tracked) {
        const raw = entries[item.id]
        if (raw === '' || raw === undefined) continue
        const actual = parseInt(raw) || 0
        const diff = actual - item.stockQuantity
        // Пишем в результат только после успешного сохранения позиции.
        await patchMut.mutateAsync({ id: item.id, stockQuantity: actual })
        res.push({ name: item.name, expected: item.stockQuantity, actual, diff })
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

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Ревизия"
        subtitle={mode === 'idle' ? `${total} товаров с учётом склада` : mode === 'active' ? `Заполнено ${filled} из ${total}` : 'Ревизия завершена'}
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
              style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: total === 0 ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)', opacity: total === 0 ? 0.5 : 1 }}
            >
              Начать ревизию
            </button>
          </div>
        )}

        {/* Active state */}
        {mode === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 8px' }}>
              Введите фактическое количество. Пустые поля — не будут обновлены.
            </p>
            {tracked.map(item => {
              const val = entries[item.id] ?? ''
              const actual = val === '' ? null : parseInt(val) || 0
              const diff = actual !== null ? actual - item.stockQuantity : null
              return (
                <div key={item.id} className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{item.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>
                        В системе: <strong>{item.stockQuantity}</strong> шт
                        {diff !== null && (
                          <span style={{ marginLeft: 8, fontWeight: 700, color: diff > 0 ? '#10B981' : diff < 0 ? '#F43F5E' : 'var(--on-surface-variant)' }}>
                            ({diff > 0 ? '+' : ''}{diff})
                          </span>
                        )}
                      </p>
                    </div>
                    <div style={{ width: 96 }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="Факт"
                        value={val}
                        onChange={e => setEntries(prev => ({ ...prev, [item.id]: e.target.value }))}
                        style={{ ...INP, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '10px 12px' }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Progress bar */}
            <div style={{ position: 'fixed', bottom: 'var(--bottom-nav-clear, 0px)', left: 0, right: 0, zIndex: 45, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', padding: '12px 20px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Прогресс: {filled}/{total}</span>
                <span style={{ fontSize: 12, color: '#8B5CF6', fontWeight: 700 }}>{Math.round(filled / total * 100)}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)', width: `${Math.round(filled / total * 100)}%`, transition: 'width 0.3s' }} />
              </div>
              <button
                onClick={finishRevision}
                disabled={saving || filled === 0}
                style={{ width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 14, border: 'none', cursor: saving || filled === 0 ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: filled === 0 ? 0.5 : 1 }}
              >
                {saving ? 'Сохраняем…' : `Завершить ревизию (${filled} позиций)`}
              </button>
            </div>
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
              style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 8 }}
            >
              Новая ревизия
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
