'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { Sheet, Button, ConfirmDialog, INP, SEL, LBL, formatMoney, Toggle } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'

interface Discount {
  id: string
  name: string
  type: 'percent' | 'fixed'
  value: number
  isActive: boolean
  isAuto: boolean
  minQuantity?: number
  itemId?: string
  clientId?: string
}

interface ClientResult { id: string; nickname: string }

interface MenuItem { id: string; name: string }

type ClientTier = 'guest' | 'resident' | 'student'

interface TierRule {
  id: string
  name: string
  clientTier: ClientTier
  discountId: string | null
  isActive: boolean
  discount: { name: string; type: 'percent' | 'fixed'; value: number | string } | null
}

const TIER_LABELS: Record<ClientTier, string> = { guest: 'Гость', resident: 'Резидент', student: 'Студент' }
const TIER_ORDER: ClientTier[] = ['guest', 'resident', 'student']

const emptyForm = { name: '', type: 'percent' as 'percent' | 'fixed', value: '', isActive: true, isAuto: false, minQuantity: '', itemId: '', itemName: '', clientId: '', clientSearch: '', clientNickname: '' }

export function DiscountsTab() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selected, setSelected] = useState<Discount | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [clientSearching, setClientSearching] = useState(false)

  const { data, isLoading } = useQuery<{ discounts: Discount[] }>({
    queryKey: ['discounts'],
    queryFn: () => api.get('/discounts'),
  })

  const discounts = data?.discounts ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['discounts'] })

  // Скидка для персонала/владельца (тумблер): когда включена, чеки, где плательщик —
  // сотрудник/владелец, автоматически списываются на персонал (итог 0₽).
  const isOwner = useAuthStore((s) => s.user?.role) === 'owner'
  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['system', 'settings'],
    queryFn: () => api.get('/system/settings'),
  })
  const staffDiscountOn = settingsData?.settings?.['staff_discount_enabled'] === '1'
  const toggleStaffDiscount = useMutation({
    mutationFn: (on: boolean) => api.patch('/system/settings', { staff_discount_enabled: on ? '1' : '0' }),
    onMutate: async (on) => {
      await qc.cancelQueries({ queryKey: ['system', 'settings'] })
      const prev = qc.getQueryData<{ settings: Record<string, string> }>(['system', 'settings'])
      qc.setQueryData(['system', 'settings'], { settings: { ...(prev?.settings ?? {}), staff_discount_enabled: on ? '1' : '0' } })
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['system', 'settings'], ctx.prev); show('Не удалось сохранить', 'error') },
    onSettled: () => qc.invalidateQueries({ queryKey: ['system', 'settings'] }),
  })

  const { data: menuData } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get('/menu/items/all'),
  })
  const menuItems = menuData?.items ?? []

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/discounts', body),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => show('Не удалось сохранить скидку', 'error'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/discounts/${id}`, body),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => show('Не удалось сохранить скидку', 'error'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/discounts/${id}`),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => { setConfirmDelete(false); show('Не удалось удалить', 'error') },
  })

  // ─── Скидки по тиру клиента ───────────────────────────────────────────────
  const [ruleTier, setRuleTier] = useState<ClientTier>('guest')
  const [ruleDiscountId, setRuleDiscountId] = useState('')
  const [confirmRuleDelete, setConfirmRuleDelete] = useState<TierRule | null>(null)

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: TierRule[] }>({
    queryKey: ['discount-tier-rules'],
    queryFn: () => api.get('/discounts/tier-rules'),
  })
  const tierRules = rulesData?.rules ?? []
  const invalidateRules = () => qc.invalidateQueries({ queryKey: ['discount-tier-rules'] })

  const createRuleMut = useMutation({
    mutationFn: (body: object) => api.post('/discounts/tier-rules', body),
    onSuccess: () => { invalidateRules(); setRuleDiscountId(''); setRuleTier('guest') },
    onError: () => show('Не удалось создать правило', 'error'),
  })
  const updateRuleMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch(`/discounts/tier-rules/${id}`, body),
    onSuccess: () => invalidateRules(),
    onError: () => show('Не удалось обновить правило', 'error'),
  })
  const deleteRuleMut = useMutation({
    mutationFn: (id: string) => api.delete(`/discounts/tier-rules/${id}`),
    onSuccess: () => { invalidateRules(); setConfirmRuleDelete(null) },
    onError: () => { setConfirmRuleDelete(null); show('Не удалось удалить правило', 'error') },
  })

  function addRule() {
    if (!ruleDiscountId) return
    createRuleMut.mutate({ clientTier: ruleTier, discountId: ruleDiscountId, isActive: true })
  }

  function openCreate() { setSelected(null); setForm(emptyForm); setClientResults([]); setShowCreate(true) }
  function openEdit(d: Discount) {
    setSelected(d)
    setForm({ name: d.name, type: d.type, value: String(d.value), isActive: d.isActive, isAuto: d.isAuto, minQuantity: d.minQuantity != null ? String(d.minQuantity) : '', itemId: d.itemId ?? '', itemName: '', clientId: d.clientId ?? '', clientSearch: '', clientNickname: '' })
    setClientResults([])
    setShowCreate(true)
  }
  function closeSheet() { setShowCreate(false); setConfirmDelete(false); setSelected(null); setForm(emptyForm); setClientResults([]) }

  async function searchClients(q: string) {
    if (!q.trim()) { setClientResults([]); return }
    setClientSearching(true)
    try {
      const res = await api.get<{ players: ClientResult[] }>(`/pos/players/search?q=${encodeURIComponent(q)}`)
      setClientResults(res.players ?? [])
    } catch { setClientResults([]) } finally { setClientSearching(false) }
  }
  function selectClient(c: ClientResult) { setForm(f => ({ ...f, clientId: c.id, clientNickname: c.nickname, clientSearch: '' })); setClientResults([]) }

  function handleSubmit() {
    const body: any = { name: form.name.trim(), type: form.type, value: parseFloat(form.value) || 0, isActive: form.isActive, isAuto: form.isAuto }
    if (form.minQuantity) body.minQuantity = parseInt(form.minQuantity) || undefined
    if (form.clientId) body.clientId = form.clientId
    if (selected) {
      // На редактировании отправляем itemId всегда: '' → null очищает привязку.
      body.itemId = form.itemId || null
      updateMut.mutate({ id: selected.id, ...body })
    } else {
      if (form.itemId) body.itemId = form.itemId
      createMut.mutate(body)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{`${discounts.length} ${discounts.length === 1 ? 'скидка' : 'скидок'}`}</span>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 13, fontWeight: 700, minHeight: 40 }}>
          <Icon name="add" size={18} color="#fff" /> Добавить
        </button>
      </div>

      {/* Скидка для персонала/владельца — тумблер */}
      {isOwner && (
        <div className="glass-l2" style={{ borderRadius: 16, padding: '16px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="badge" size={22} color="#F59E0B" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Скидка для персонала (100%)</p>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0', lineHeight: 1.4 }}>Когда включена, чек с плательщиком-сотрудником/владельцем списывается на персонал: итог 0&nbsp;₽, остаток уходит, а в аналитике «Персонал» видна товарная сумма и себестоимость.</p>
          </div>
          <Toggle value={staffDiscountOn} onChange={(v) => toggleStaffDiscount.mutate(v)} color="#F59E0B" ariaLabel="Скидка для персонала" />
        </div>
      )}

      {isLoading && !data ? (
        <StateView state="loading" />
      ) : discounts.length === 0 ? (
        <StateView state="empty" icon="percent" title="Скидок нет" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {discounts.map((d) => (
            <div key={d.id} className="glass-l2" onClick={() => openEdit(d)} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: d.type === 'percent' ? 'rgba(139,92,246,0.15)' : 'rgba(76,215,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: d.type === 'percent' ? 'var(--primary-violet)' : 'var(--secondary)' }}>{d.type === 'percent' ? '%' : '₽'}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                  {d.isAuto && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Авто</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {d.minQuantity != null && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>от {d.minQuantity} шт</span>}
                  {d.itemId && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="link" size={12} />Товар</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: d.type === 'percent' ? 'var(--primary-violet)' : 'var(--secondary)' }}>{d.type === 'percent' ? `${d.value}%` : formatMoney(d.value)}</span>
                <span style={{ padding: '2px 8px', borderRadius: 6, background: d.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: d.isActive ? 'var(--success)' : '#94A3B8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.isActive ? 'Активна' : 'Откл.'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Скидки по тиру клиента ─────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Скидки по тиру</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 14px' }}>
          Скидка применяется на кассе по тиру клиента автоматически, независимо от флага «Авто».
        </p>

        {rulesLoading && !rulesData ? (
          <StateView state="loading" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tierRules.length === 0 ? (
              <div className="glass-l2" style={{ borderRadius: 14, padding: '18px', textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>
                Правил пока нет
              </div>
            ) : (
              [...tierRules]
                .sort((a, b) => TIER_ORDER.indexOf(a.clientTier) - TIER_ORDER.indexOf(b.clientTier))
                .map((r) => {
                  const valueText = r.discount
                    ? (r.discount.type === 'percent' ? `${r.discount.value}%` : formatMoney(r.discount.value))
                    : '—'
                  return (
                    <div key={r.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(76,215,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="badge" size={20} color="var(--secondary)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{TIER_LABELS[r.clientTier]}</div>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.discount ? `${r.discount.name} · ${valueText}` : 'Скидка удалена'}
                        </div>
                      </div>
                      <button
                        onClick={() => updateRuleMut.mutate({ id: r.id, isActive: !r.isActive })}
                        disabled={updateRuleMut.isPending}
                        aria-pressed={r.isActive}
                        aria-label={r.isActive ? 'Отключить правило' : 'Включить правило'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.isActive ? 'var(--success)' : '#94A3B8', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <Icon name={r.isActive ? 'toggle_on' : 'toggle_off'} size={28} />
                      </button>
                      <button
                        onClick={() => setConfirmRuleDelete(r)}
                        aria-label="Удалить правило"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <Icon name="delete" size={20} />
                      </button>
                    </div>
                  )
                })
            )}

            {/* Добавить правило */}
            <div className="glass-l2" style={{ borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Добавить правило</span>
              <div>
                <label style={LBL}>Тир клиента</label>
                <select style={SEL} value={ruleTier} onChange={e => setRuleTier(e.target.value as ClientTier)}>
                  {TIER_ORDER.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Скидка</label>
                <select style={SEL} value={ruleDiscountId} onChange={e => setRuleDiscountId(e.target.value)}>
                  <option value="">Выберите скидку…</option>
                  {discounts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.type === 'percent' ? `${d.value}%` : formatMoney(d.value)})
                    </option>
                  ))}
                </select>
              </div>
              <Button fullWidth icon="add" loading={createRuleMut.isPending} disabled={!ruleDiscountId} onClick={addRule}>Добавить</Button>
              {discounts.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Сначала создайте скидку выше.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Sheet open={showCreate} onClose={closeSheet} title={selected ? 'Редактировать скидку' : 'Новая скидка'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Название</label><input style={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название скидки" /></div>
          <div>
            <label style={LBL}>Тип</label>
            <select style={SEL} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}>
              <option value="percent">Процент (%)</option>
              <option value="fixed">Фиксированная (₽)</option>
            </select>
          </div>
          <div><label style={LBL}>Значение</label><input style={INP} type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === 'percent' ? 'Процент' : 'Сумма'} /></div>
          <div><label style={LBL}>Мин. количество (необязательно)</label><input style={INP} type="number" min="1" value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} placeholder="от X шт" /></div>

          <div>
            <label style={LBL}>Привязка к товару (необязательно)</label>
            <select style={SEL} value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}>
              <option value="">Любой товар</option>
              {menuItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Скидка применится к этой позиции при достижении мин. количества</p>
          </div>

          <div>
            <label style={LBL}>Привязка к клиенту (необязательно)</label>
            {form.clientId && form.clientNickname ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)' }}>
                <Icon name="person" size={16} color="#a78bfa" />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--on-surface)', fontWeight: 600 }}>{form.clientNickname}</span>
                <button onClick={() => setForm(f => ({ ...f, clientId: '', clientNickname: '' }))} aria-label="Убрать клиента" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center' }}><Icon name="close" size={18} /></button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input style={INP} placeholder="Поиск клиента по никнейму..." value={form.clientSearch} onChange={e => { setForm(f => ({ ...f, clientSearch: e.target.value })); searchClients(e.target.value) }} />
                {clientResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'rgba(29,26,36,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {clientResults.map(cl => (
                      <button key={cl.id} onClick={() => selectClient(cl)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)', fontSize: 14 }}>
                        <Icon name="person" size={16} color="#a78bfa" />{cl.nickname}
                      </button>
                    ))}
                  </div>
                )}
                {clientSearching && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Поиск...</p>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} aria-pressed={form.isActive} style={{ flex: 1, minHeight: 44, padding: '12px 16px', borderRadius: 12, border: `1px solid ${form.isActive ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)', color: form.isActive ? 'var(--success)' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name={form.isActive ? 'toggle_on' : 'toggle_off'} size={16} />Активна
            </button>
            <button onClick={() => setForm(f => ({ ...f, isAuto: !f.isAuto }))} aria-pressed={form.isAuto} style={{ flex: 1, minHeight: 44, padding: '12px 16px', borderRadius: 12, border: `1px solid ${form.isAuto ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isAuto ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)', color: form.isAuto ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="auto_awesome" size={16} />Авто
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '-6px 0 0' }}>«Авто» — скидка применяется на кассе автоматически (по товару/количеству/клиенту). Без «Авто» — доступна вручную.</p>

          <Button fullWidth size="lg" loading={createMut.isPending || updateMut.isPending} disabled={!form.name.trim() || !form.value} onClick={handleSubmit}>{selected ? 'Сохранить' : 'Создать'}</Button>
          {selected && <Button variant="danger" fullWidth onClick={() => setConfirmDelete(true)}>Удалить скидку</Button>}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => selected && deleteMut.mutate(selected.id)}
        title="Удалить скидку?"
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
      />

      <ConfirmDialog
        open={!!confirmRuleDelete}
        onClose={() => setConfirmRuleDelete(null)}
        onConfirm={() => confirmRuleDelete && deleteRuleMut.mutate(confirmRuleDelete.id)}
        title="Удалить правило?"
        confirmLabel="Удалить"
        danger
        loading={deleteRuleMut.isPending}
      />
    </div>
  )
}
