'use client'
import React, { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, INP, formatMoney, ConfirmDialog } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }

interface SupplyItemDto { itemId?: string | null; name: string; unit: string; quantity: number; costPerUnit: number }
interface Supply { id: string; date: string; totalCost?: string; items: SupplyItemDto[] }
interface InvItem { id: string; name: string; stockQuantity: number; searchTags?: string[] }

interface DraftItem {
  _key: number
  itemId?: string
  name: string
  quantity: string
  costPerUnit: string
  total: string
  baseline?: number   // цена для сравнения: прошлая закупка (создание) или прежняя цена (правка)
}

let keySeq = 1
function newDraft(): DraftItem { return { _key: keySeq++, name: '', quantity: '1', costPerUnit: '', total: '' } }
function draftFromItem(it: SupplyItemDto): DraftItem {
  const q = it.quantity, c = it.costPerUnit
  return {
    _key: keySeq++,
    itemId: it.itemId ?? undefined,
    name: it.name && it.name !== '—' ? it.name : '',
    quantity: String(q),
    costPerUnit: c ? String(c) : '',
    total: c ? String(round2(q * c)) : '',
    baseline: c || undefined,
  }
}
const lineTotal = (it: DraftItem) => num(it.total) || round2(num(it.quantity) * num(it.costPerUnit))

const BTN_GRADIENT = 'linear-gradient(135deg, #8B5CF6, #4cd7f6)'

function PriceNote({ current, baseline, isEdit }: { current: number; baseline?: number; isEdit: boolean }) {
  if (!baseline || !current || current === baseline) return null
  const diff = round2(current - baseline)
  const up = diff > 0
  const color = up ? '#F87171' : '#34D399'
  const text = isEdit
    ? `${up ? 'Подорожало' : 'Подешевело'} на ${formatMoney(Math.abs(diff))} (было ${formatMoney(baseline)})`
    : `${up ? 'Подорожало' : 'Подешевело'} на ${formatMoney(Math.abs(diff))} с прошлой закупки`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>
      <Icon name={up ? 'trending_up' : 'trending_down'} size={14} color={color} />
      {text}
    </div>
  )
}

/* ─── Supply editor (создание + правка) ──────────────────────────── */
function SupplyEditor({ open, supply, onClose, onSaved, onDelete }: {
  open: boolean
  supply: Supply | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const { show } = useToast()
  const isEdit = !!supply
  const [items, setItems] = useState<DraftItem[]>([newDraft()])
  const [focusedKey, setFocusedKey] = useState<number | null>(null)
  const [reason, setReason] = useState('')   // обязательная причина при корректировке
  const idemRef = useRef<string>('')

  useEffect(() => {
    if (!open) return
    if (supply) {
      setItems(supply.items.length ? supply.items.map(draftFromItem) : [newDraft()])
    } else {
      setItems([newDraft()])
      idemRef.current = crypto.randomUUID()
    }
    setFocusedKey(null)
    setReason('')
  }, [open, supply])

  const { data: invData } = useQuery({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get<{ items: InvItem[] }>('/menu/items/all'),
    enabled: open,
  })
  const invItems = invData?.items ?? []

  const when = useMemo(() => (supply ? new Date(supply.date) : new Date()), [open, supply])
  const dateStr = format(when, 'd MMMM yyyy', { locale: ru })
  const timeStr = format(when, 'HH:mm', { locale: ru })

  async function fetchLastPrice(itemId: string): Promise<number | null> {
    try { const r = await api.get<{ lastPrice: number | null }>(`/supplies/items/${itemId}/last-price`); return r.lastPrice } catch { return null }
  }

  function patchItem(key: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map(it => (it._key === key ? { ...it, ...patch } : it)))
  }

  // Синхронизация трёх полей: правка кол-ва/цены пересчитывает сумму;
  // правка суммы пересчитывает цену за штуку (qty фиксирован).
  function setQty(key: number, raw: string) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const qn = num(raw), pn = num(it.costPerUnit), tn = num(it.total)
      if (pn > 0) return { ...it, quantity: raw, total: qn ? String(round2(qn * pn)) : it.total }
      if (tn > 0 && qn > 0) return { ...it, quantity: raw, costPerUnit: String(round2(tn / qn)) }
      return { ...it, quantity: raw }
    }))
  }
  function setPerUnit(key: number, raw: string) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const qn = num(it.quantity), pn = num(raw)
      return { ...it, costPerUnit: raw, total: qn && pn ? String(round2(qn * pn)) : it.total }
    }))
  }
  function setTotal(key: number, raw: string) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const qn = num(it.quantity), tn = num(raw)
      return { ...it, total: raw, costPerUnit: qn > 0 ? String(round2(tn / qn)) : it.costPerUnit }
    }))
  }

  function updateName(key: number, value: string) {
    // Ручной ввод отвязывает позицию от карточки склада (становится свободной строкой).
    patchItem(key, { name: value, itemId: undefined })
  }

  async function pickInv(key: number, inv: InvItem) {
    setItems(prev => prev.map(it => (it._key === key ? { ...it, itemId: inv.id, name: inv.name } : it)))
    setFocusedKey(null)
    const last = await fetchLastPrice(inv.id)
    setItems(prev => prev.map(it => {
      if (it._key !== key || it.itemId !== inv.id) return it
      if (last == null) return { ...it, baseline: undefined }
      const hadPrice = num(it.costPerUnit) > 0
      const cost = hadPrice ? it.costPerUnit : String(last)
      const qn = num(it.quantity), cn = num(cost)
      return { ...it, baseline: last, costPerUnit: cost, total: qn && cn ? String(round2(qn * cn)) : it.total }
    }))
  }

  function rowError(it: DraftItem): string | null {
    if (!it.name.trim()) return 'Укажите название'
    const q = num(it.quantity)
    if (!(q > 0)) return 'Количество должно быть больше 0'
    if (it.itemId && !Number.isInteger(q)) return 'Для складской позиции количество должно быть целым'
    return null
  }
  const reasonMissing = isEdit && reason.trim().length < 3
  const hasErrors = items.length === 0 || items.some(it => rowError(it) !== null) || reasonMissing
  const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0)

  const save = useMutation({
    mutationFn: (payload: any) => isEdit
      ? api.patch(`/supplies/${supply!.id}`, payload)
      : api.post('/supplies', { ...payload, idempotencyKey: idemRef.current }),
    onSuccess: () => { if (!isEdit) idemRef.current = crypto.randomUUID(); onSaved() },
    onError: () => show(isEdit ? 'Не удалось сохранить изменения' : 'Не удалось сохранить закупку', 'error'),
  })

  function submit() {
    const payload: any = {
      items: items.map(it => ({
        itemId: it.itemId,
        name: it.name.trim(),
        unit: 'шт',
        quantity: num(it.quantity),
        costPerUnit: num(it.costPerUnit),
      })),
    }
    if (isEdit) payload.reason = reason.trim()
    save.mutate(payload)
  }

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Корректировка закупки' : 'Новая закупка'} desktopSize="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Дата = название закупки, время — подзаголовок */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="event" size={22} color="#a78bfa" />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>{dateStr}</p>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>{isEdit ? 'Корректировка' : 'Новая закупка'} · {timeStr}</p>
          </div>
        </div>

        {/* Карточки позиций */}
        {items.map((it, idx) => {
          const err = rowError(it)
          const sugg = (it.name.trim()
            ? invItems.filter(inv => { const q = it.name.toLowerCase(); return inv.name.toLowerCase().includes(q) || (inv.searchTags ?? []).some(t => t.toLowerCase().includes(q)) })
            : invItems
          ).filter(inv => inv.id !== it.itemId).slice(0, 6)
          const showDrop = focusedKey === it._key && sugg.length > 0
          return (
            <div key={it._key} className="glass-l1" style={{ borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)' }}>
                  Позиция {idx + 1}
                  {it.itemId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>склад</span>}
                </span>
                {items.length > 1 && (
                  <button onClick={() => setItems(prev => prev.filter(x => x._key !== it._key))} aria-label="Удалить позицию" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="delete" size={15} />
                  </button>
                )}
              </div>

              {/* Название с автоподбором из склада */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  placeholder="Название позиции"
                  value={it.name}
                  onChange={e => updateName(it._key, e.target.value)}
                  onFocus={() => setFocusedKey(it._key)}
                  onBlur={() => setTimeout(() => setFocusedKey(k => (k === it._key ? null : k)), 150)}
                  style={INP}
                />
                {showDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 30, background: '#1d1a24', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                    {sugg.map(inv => (
                      <button
                        key={inv.id}
                        onMouseDown={e => { e.preventDefault(); pickInv(it._key, inv) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ fontSize: 13, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>{inv.stockQuantity} шт</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Количество · за штуку · общая (синхронизированы) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <FieldBox label="Кол-во">
                  <input type="number" min={0} step={it.itemId ? 1 : 'any'} inputMode={it.itemId ? 'numeric' : 'decimal'} value={it.quantity} onChange={e => setQty(it._key, e.target.value)} style={miniInp} />
                </FieldBox>
                <FieldBox label="За штуку, ₽">
                  <input type="number" min={0} inputMode="decimal" value={it.costPerUnit} onChange={e => setPerUnit(it._key, e.target.value)} placeholder="0" style={miniInp} />
                </FieldBox>
                <FieldBox label="Сумма, ₽">
                  <input type="number" min={0} inputMode="decimal" value={it.total} onChange={e => setTotal(it._key, e.target.value)} placeholder="0" style={miniInp} />
                </FieldBox>
              </div>

              <PriceNote current={num(it.costPerUnit)} baseline={it.baseline} isEdit={isEdit} />
              {err && <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600, color: '#F87171' }}>{err}</p>}
            </div>
          )
        })}

        {/* Добавить позицию (как «Новый чек» — градиент) */}
        <button
          onClick={() => setItems(prev => [...prev, newDraft()])}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: BTN_GRADIENT, color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}
        >
          <Icon name="add" size={18} color="#fff" /> Добавить позицию
        </button>

        {/* Причина корректировки (обязательно при правке проведённой закупки) */}
        {isEdit && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="edit" size={15} color="#a78bfa" /> Причина корректировки <span style={{ color: '#F87171' }}>*</span>
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Например: ошиблись в количестве / поставщик пересчитал цену"
              rows={2}
              style={{ ...INP, resize: 'vertical', minHeight: 56, fontWeight: 500 }}
            />
            {reasonMissing && <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600, color: '#F87171' }}>Укажите причину (не короче 3 символов)</p>}
          </div>
        )}

        {/* Итог */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Итого по закупке</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(grandTotal)}</span>
        </div>

        <button
          onClick={submit}
          disabled={hasErrors || save.isPending}
          style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: hasErrors ? 'not-allowed' : 'pointer', background: BTN_GRADIENT, color: '#fff', fontSize: 15, fontWeight: 700, opacity: hasErrors ? 0.5 : 1 }}
        >
          {save.isPending ? 'Сохраняем…' : isEdit ? 'Сохранить корректировку' : 'Создать закупку'}
        </button>

        {isEdit && onDelete && (
          <button
            onClick={onDelete}
            style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.25)', cursor: 'pointer', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name="delete" size={16} color="#F87171" /> Удалить закупку
          </button>
        )}
      </div>
    </Sheet>
  )
}

const miniInp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 14, fontWeight: 600, textAlign: 'center' }
function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--on-surface-variant)', margin: '0 0 4px', textAlign: 'center' }}>{label}</p>
      {children}
    </div>
  )
}

interface SupplyCorrection { id: string; reason: string; totalBefore: number; totalAfter: number; createdAt: string }

/* ─── Read-only просмотр проведённой закупки ───────────────────────── */
function SupplyView({ open, supply: fallback, onClose, onCorrect, onDelete }: {
  open: boolean
  supply: Supply | null
  onClose: () => void
  onCorrect: (s: Supply) => void
  onDelete?: () => void
}) {
  const { data } = useQuery({
    queryKey: ['supplies', fallback?.id],
    queryFn: () => api.get<{ supply: Supply; items: SupplyItemDto[]; corrections: SupplyCorrection[] }>(`/supplies/${fallback!.id}`),
    enabled: open && !!fallback?.id,
  })
  const supply = data?.supply ?? fallback
  const items = data?.items ?? fallback?.items ?? []
  const corrections = data?.corrections ?? []
  if (!supply) return <Sheet open={open} onClose={onClose} title="Закупка" desktopSize="lg"><StateView state="loading" /></Sheet>
  const total = Number(supply.totalCost ?? 0) || items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)
  const when = new Date(supply.date)

  return (
    <Sheet open={open} onClose={onClose} title="Закупка" desktopSize="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Дата */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="local_shipping" size={22} color="#a78bfa" />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>{format(when, 'd MMMM yyyy', { locale: ru })}</p>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>Закупка · {format(when, 'HH:mm', { locale: ru })} · {items.length} поз.</p>
          </div>
        </div>

        {/* Позиции (только просмотр) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, idx) => (
            <div key={idx} className="glass-l1" style={{ borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{it.quantity} × {formatMoney(it.costPerUnit)}</p>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatMoney(round2(it.quantity * it.costPerUnit))}</p>
            </div>
          ))}
        </div>

        {/* История корректировок */}
        {corrections.length > 0 && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="history" size={15} color="#a78bfa" /> Корректировки
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {corrections.map(cr => {
                const diff = round2(cr.totalAfter - cr.totalBefore)
                const up = diff > 0
                return (
                  <div key={cr.id} className="glass-l1" style={{ borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{format(new Date(cr.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}</span>
                      {diff !== 0 && <span style={{ fontSize: 13, fontWeight: 700, color: up ? '#F87171' : '#34D399', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{up ? '+' : '−'}{formatMoney(Math.abs(diff))}</span>}
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--on-surface)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{cr.reason}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Итог */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Итого по закупке</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</span>
        </div>

        {/* Действия */}
        <button
          onClick={() => onCorrect({ ...supply, items })}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: BTN_GRADIENT, color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}
        >
          <Icon name="edit" size={17} color="#fff" /> Корректировка
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.25)', cursor: 'pointer', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name="delete" size={16} color="#F87171" /> Удалить закупку
          </button>
        )}
      </div>
    </Sheet>
  )
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function SuppliesPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const isOwner = useAuthStore(s => s.user?.role) === 'owner'

  const [creating, setCreating] = useState(false)       // новая закупка (редактор)
  const [editing, setEditing] = useState<Supply | null>(null)   // корректировка (редактор)
  const [viewing, setViewing] = useState<Supply | null>(null)   // просмотр проведённой
  const [confirmDel, setConfirmDel] = useState<Supply | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['supplies'], queryFn: () => api.get<{ supplies: Supply[] }>('/supplies') })
  const supplies = useMemo(
    () => [...(data?.supplies ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [data],
  )

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['supplies'] })
    qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
    qc.invalidateQueries({ queryKey: ['menu', 'items', 'all'] })
  }

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/supplies/${id}`),
    onSuccess: () => { invalidateAll(); setConfirmDel(null) },
    onError: () => { setConfirmDel(null); show('Не удалось удалить закупку', 'error') },
  })

  const pluralWord = supplies.length === 1 ? 'закупка' : supplies.length >= 2 && supplies.length <= 4 ? 'закупки' : 'закупок'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Закупки"
        subtitle={`${supplies.length} ${pluralWord}`}
        action={{ label: 'Новая', icon: 'add', onClick: () => { setEditing(null); setCreating(true) } }}
      />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : supplies.length === 0 ? (
          <StateView state="empty" icon="inventory_2" title="Закупок нет" />
        ) : (
          supplies.map(supply => {
            const total = Number(supply.totalCost ?? 0) || supply.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0)
            return (
              <button
                key={supply.id}
                onClick={() => setViewing(supply)}
                className="glass-l2"
                style={{ borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', width: '100%' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="local_shipping" size={22} color="#a78bfa" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{format(new Date(supply.date), 'd MMMM yyyy', { locale: ru })}</p>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{format(new Date(supply.date), 'HH:mm', { locale: ru })} · {supply.items.length} поз.</p>
                </div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--on-surface)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</p>
                <Icon name="chevron_right" size={20} color="var(--on-surface-variant)" />
              </button>
            )
          })
        )}
      </div>

      {/* Просмотр проведённой закупки (read-only) */}
      <SupplyView
        open={!!viewing}
        supply={viewing}
        onClose={() => setViewing(null)}
        onCorrect={(s) => { setViewing(null); setEditing(s); setCreating(false) }}
        onDelete={viewing && isOwner ? () => { const s = viewing; setViewing(null); setConfirmDel(s) } : undefined}
      />

      {/* Создание / корректировка */}
      <SupplyEditor
        open={creating || !!editing}
        supply={editing}
        onClose={() => { setCreating(false); setEditing(null) }}
        onSaved={() => {
          invalidateAll()
          const corrected = editing
          setCreating(false)
          setEditing(null)
          // После корректировки сразу возвращаем read-only просмотр с новой записью.
          if (corrected) setViewing(corrected)
        }}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && delMut.mutate(confirmDel.id)}
        title="Удалить закупку?"
        message={confirmDel ? `Закупка от ${format(new Date(confirmDel.date), 'd MMMM yyyy', { locale: ru })} будет удалена, а принятый остаток снят со склада.` : undefined}
        confirmLabel="Удалить"
        danger
        loading={delMut.isPending}
      />
    </div>
  )
}
