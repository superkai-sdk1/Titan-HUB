'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format, formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, INP, SEL, LBL } from '@/components/manage/DesignSystem'
import { PullToRefreshContainer } from '@/components/PullToRefreshContainer'

const TIER_COLORS: Record<string, string> = {
  guest: 'rgba(204,195,216,0.6)', resident: '#8B5CF6', student: '#3B82F6',
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B', platinum: '#E2E8F0',
}
const TIER_LABELS: Record<string, string> = {
  guest: 'Гость', resident: 'Резидент', student: 'Студент',
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина',
}

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }
function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }

export default function ClientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dbSearch, setDbSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [tab, setTab] = useState<'info' | 'tx'>('info')
  const [form, setForm] = useState({ nickname: '', phone: '', birthday: '', clientTier: 'guest', password: '' })
  const [editForm, setEditForm] = useState<any>(null)
  const [balAmt, setBalAmt] = useState('')
  const [bonAmt, setBonAmt] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDbSearch(search), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search])

  const { data } = useQuery({ queryKey: ['clients', dbSearch], queryFn: () => api.get<any>(`/clients?search=${dbSearch}&page=1`), staleTime: 10000 })
  const { data: txData } = useQuery({ queryKey: ['clients', selected?.id, 'tx'], queryFn: () => api.get<any>(`/clients/${selected.id}/transactions`), enabled: !!selected?.id && tab === 'tx' })

  const create = useMutation({ mutationFn: (b: any) => api.post('/clients', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setShowCreate(false); setForm({ nickname: '', phone: '', birthday: '', clientTier: 'guest', password: '' }) } })
  const update = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/clients/${id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setSelected(null) } })
  const adjBal = useMutation({ mutationFn: ({ id, amount }: any) => api.post(`/clients/${id}/balance`, { amount }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setBalAmt('') } })
  const adjBon = useMutation({ mutationFn: ({ id, amount }: any) => api.post(`/clients/${id}/bonus`, { amount }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setBonAmt('') } })

  const clients: any[] = data?.clients ?? []

  // Tier distribution
  const tierCounts = Object.fromEntries(Object.keys(TIER_LABELS).map(k => [k, clients.filter(c => (c.clientTier ?? 'guest') === k).length]))

  function openDetail(c: any) {
    setSelected(c)
    setEditForm({ nickname: c.nickname, phone: c.phone ?? '', birthday: c.birthday ?? '', clientTier: c.clientTier ?? 'guest' })
    setTab('info'); setBalAmt(''); setBonAmt('')
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Клиенты"
        subtitle={`${clients.length} игроков`}
        action={{ label: 'Добавить', icon: 'person_add', onClick: () => setShowCreate(true) }}
      />

      {/* Search + tier chips */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--on-surface-variant)', pointerEvents: 'none' }}>search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по нику или телефону…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {Object.entries(TIER_LABELS).filter(([k]) => (tierCounts[k] ?? 0) > 0).map(([k, l]) => (
              <span key={k} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: `${TIER_COLORS[k]}22`, color: TIER_COLORS[k], whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                {l} {tierCounts[k]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <PullToRefreshContainer onRefresh={async () => { qc.invalidateQueries({ queryKey: ['clients'] }) }}>
      <div style={{ padding: '16px 16px 100px', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {clients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>group</span>
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Клиенты не найдены</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clients.map((c: any) => {
              const tier = c.clientTier ?? 'guest'
              const tierColor = TIER_COLORS[tier]
              return (
                <div key={c.id} className="glass-l2" onClick={() => openDetail(c)}
                  style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${tierColor}55` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, background: `${tierColor}22`, border: `2px solid ${tierColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: tierColor }}>
                    {(c.nickname ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 4 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{c.nickname}</p>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${tierColor}22`, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{TIER_LABELS[tier]}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>{c.phone ?? 'Нет телефона'}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(parseNum(c.balance))} ₽</p>
                    <p style={{ fontSize: 11, color: '#EAB308', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>star</span>{fmt(parseNum(c.bonusPoints))}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </PullToRefreshContainer>

      {/* Create sheet */}
      <Sheet open={showCreate} onClose={() => setShowCreate(false)} title="Новый клиент">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {([['Никнейм *', 'nickname', 'text'], ['Телефон', 'phone', 'tel'], ['День рождения', 'birthday', 'date'], ['Пароль', 'password', 'password']] as [string, string, string][]).map(([lbl, key, type]) => (
            <div key={key}><label style={LBL}>{lbl}</label><input type={type} value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={INP} /></div>
          ))}
          <div><label style={LBL}>Уровень</label><select value={form.clientTier} onChange={e => setForm(p => ({ ...p, clientTier: e.target.value }))} style={{ ...INP, background: 'rgba(29,26,36,0.8)', cursor: 'pointer' } as React.CSSProperties}>{Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.nickname.trim()} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: create.isPending || !form.nickname.trim() ? 0.6 : 1, marginTop: 4 }}>
            {create.isPending ? 'Создаём…' : 'Создать клиента'}
          </button>
        </div>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} maxHeight="92vh">
        {selected && (() => {
          const tier = selected.clientTier ?? 'guest'
          const tierColor = TIER_COLORS[tier]
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${tierColor}22`, border: `2px solid ${tierColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: tierColor }}>
                  {(selected.nickname ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>{selected.nickname}</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: `${tierColor}22`, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{TIER_LABELS[tier]}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                {[['account_balance_wallet', 'Баланс', `${fmt(parseNum(selected.balance))} ₽`, '#8B5CF6'], ['star', 'Бонусы', fmt(parseNum(selected.bonusPoints)), '#EAB308'], ['calendar_today', 'Рег-ция', selected.createdAt ? format(new Date(selected.createdAt), 'd MMM yy', { locale: ru }) : '—', '#4cd7f6']].map(([icon, lbl, val, color]) => (
                  <div key={lbl as string} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: color as string, display: 'block', marginBottom: 4 }}>{icon}</span>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', fontFamily: "'JetBrains Mono',monospace" }}>{val}</p>
                    <p style={{ fontSize: 9, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono',monospace" }}>{lbl}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                {[['info', 'Профиль'], ['tx', 'Транзакции']].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k as any)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, color: tab === k ? '#8B5CF6' : 'var(--on-surface-variant)', borderBottom: tab === k ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
                ))}
              </div>
              {tab === 'info' && editForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {([['Никнейм', 'nickname', 'text'], ['Телефон', 'phone', 'tel'], ['День рождения', 'birthday', 'date']] as [string, string, string][]).map(([lbl, key, type]) => (
                    <div key={key}><label style={LBL}>{lbl}</label><input type={type} value={editForm[key] ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, [key]: e.target.value }))} style={INP} /></div>
                  ))}
                  <div><label style={LBL}>Уровень</label><select value={editForm.clientTier} onChange={e => setEditForm((p: any) => ({ ...p, clientTier: e.target.value }))} style={{ ...INP, background: 'rgba(29,26,36,0.8)', cursor: 'pointer' } as React.CSSProperties}>{Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <button onClick={() => update.mutate({ id: selected.id, ...editForm })} disabled={update.isPending} style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Сохранить</button>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                    <p style={{ ...LBL, marginBottom: 10 }}>Пополнить баланс (₽)</p>
                    <div style={{ display: 'flex', gap: 8 }}><input type="number" value={balAmt} onChange={e => setBalAmt(e.target.value)} placeholder="500 или -500" style={{ ...INP, flex: 1 }} /><button onClick={() => adjBal.mutate({ id: selected.id, amount: Number(balAmt) })} disabled={!balAmt} style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>OK</button></div>
                  </div>
                  <div>
                    <p style={{ ...LBL, marginBottom: 10 }}>Изменить бонусы</p>
                    <div style={{ display: 'flex', gap: 8 }}><input type="number" value={bonAmt} onChange={e => setBonAmt(e.target.value)} placeholder="100 или -100" style={{ ...INP, flex: 1 }} /><button onClick={() => adjBon.mutate({ id: selected.id, amount: Number(bonAmt) })} disabled={!bonAmt} style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#EAB308', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>OK</button></div>
                  </div>
                  <button onClick={() => update.mutate({ id: selected.id, deletedAt: new Date().toISOString() })} style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>block</span>Заблокировать
                  </button>
                </div>
              )}
              {tab === 'tx' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!txData?.transactions?.length
                    ? <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '24px 0' }}>Нет транзакций</p>
                    : txData.transactions.map((tx: any) => (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{tx.description ?? tx.type}</p>
                          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{tx.createdAt ? formatDistanceToNow(new Date(tx.createdAt), { locale: ru, addSuffix: true }) : ''}</p>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, fontStyle: 'italic', color: parseNum(tx.amount) >= 0 ? '#10B981' : '#F43F5E', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>
                          {parseNum(tx.amount) >= 0 ? '+' : ''}{fmt(parseNum(tx.amount))} ₽
                        </p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )
        })()}
      </Sheet>
    </div>
  )
}
