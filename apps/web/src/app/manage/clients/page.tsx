'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { PageHeader, Sheet, Button, IconButton, ConfirmDialog, INP, LBL } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { telLink, openContact } from '@/lib/contact'

const TIER_COLORS: Record<string, string> = {
  guest: 'rgba(204,195,216,0.6)', resident: '#8B5CF6', student: '#3B82F6',
  bronze: '#cd7f32', silver: '#94A3B8', gold: '#F59E0B', platinum: '#E2E8F0',
}
const TIER_LABELS: Record<string, string> = {
  guest: 'Гость', resident: 'Резидент', student: 'Студент',
  bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина',
}

type TierRow = { key: string; label: string; color: string; sortOrder: number; isSystem: boolean }

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }
function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function pluralVisits(n: number) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return 'посещений'
  if (b > 1 && b < 5) return 'посещения'
  if (b === 1) return 'посещение'
  return 'посещений'
}
function adjBtnStyle(color: string): React.CSSProperties {
  return { flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${color}40`, background: `${color}14`, color, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
}
const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'СБП', bonus: 'Бонусы',
  deposit: 'Депозит', debt: 'Долг', certificate: 'Сертификат', split: 'Раздельная',
}

export default function ClientsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [search, setSearch] = useState('')
  const [dbSearch, setDbSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [tab, setTab] = useState<'info' | 'tx'>('info')
  const [form, setForm] = useState({ nickname: '', fullName: '', phone: '', birthday: '', clientTier: 'guest', password: '' })
  const [editForm, setEditForm] = useState<any>(null)
  const [showTiers, setShowTiers] = useState(false)
  const [newTier, setNewTier] = useState({ label: '', color: '#8B5CF6' })
  const [tagsInput, setTagsInput] = useState('')
  const [tgQr, setTgQr] = useState<{ deepLink: string; qrDataUrl: string } | null>(null)
  // Модалка начисления/списания (баланс или бонусы).
  const [adjModal, setAdjModal] = useState<{ kind: 'balance' | 'bonus'; op: 'add' | 'sub' } | null>(null)
  const [adjAmount, setAdjAmount] = useState('')
  const [adjComment, setAdjComment] = useState('')
  const [checkModalId, setCheckModalId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDbSearch(search), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search])

  // Новый поиск — сбрасываем пагинацию на первую страницу.
  useEffect(() => { setPage(1) }, [dbSearch])

  // Аккумулируем страницы: query key включает page, а накопленный список
  // собираем через placeholderData (предыдущие страницы остаются в кэше по
  // своим ключам). Грузим страницы 1..page и склеиваем.
  const pageQueries = useQuery({
    queryKey: ['clients', dbSearch, page],
    queryFn: async () => {
      const reqs = []
      for (let p = 1; p <= page; p++) {
        reqs.push(api.get<any>(`/clients?search=${encodeURIComponent(dbSearch)}&page=${p}`))
      }
      const pages = await Promise.all(reqs)
      const merged: any[] = []
      const seen = new Set<string>()
      for (const pg of pages) {
        for (const cl of (pg?.clients ?? [])) {
          if (!seen.has(cl.id)) { seen.add(cl.id); merged.push(cl) }
        }
      }
      const last = pages[pages.length - 1]
      return { clients: merged, total: last?.total ?? merged.length, limit: last?.limit ?? 30 }
    },
    staleTime: 10000,
    placeholderData: (prev) => prev,
  })
  const { data, isLoading } = pageQueries
  const { data: txData } = useQuery({ queryKey: ['clients', selected?.id, 'tx'], queryFn: () => api.get<any>(`/clients/${selected.id}/transactions`), enabled: !!selected?.id && tab === 'tx' })
  const { data: vpData } = useQuery({ queryKey: ['clients', selected?.id, 'visit'], queryFn: () => api.get<{ tier: string; visits: number; threshold: number; remaining: number; isResident: boolean }>(`/clients/${selected.id}/visit-progress`), enabled: !!selected?.id && tab === 'tx' })
  const { data: checkDetail } = useQuery({ queryKey: ['check-detail', checkModalId], queryFn: () => api.get<any>(`/analytics/checks/${checkModalId}`), enabled: !!checkModalId })

  // Справочник статусов (динамический). Фоллбек на встроенные метки/цвета, если
  // справочник ещё не загрузился, чтобы UI не «прыгал».
  const { data: tiersData } = useQuery({ queryKey: ['client-tiers'], queryFn: () => api.get<{ tiers: TierRow[] }>('/clients/tiers') })
  const tierList: TierRow[] = tiersData?.tiers ?? Object.keys(TIER_LABELS).map((k, i) => ({ key: k, label: TIER_LABELS[k], color: TIER_COLORS[k] ?? '#8B5CF6', sortOrder: i, isSystem: ['guest', 'resident', 'student'].includes(k) }))
  const labelOf = (k: string) => tierList.find(t => t.key === k)?.label ?? TIER_LABELS[k] ?? k
  const colorOf = (k: string) => tierList.find(t => t.key === k)?.color ?? TIER_COLORS[k] ?? '#8B5CF6'

  const createTier = useMutation({ mutationFn: (b: { label: string; color: string }) => api.post('/clients/tiers', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-tiers'] }); setNewTier({ label: '', color: '#8B5CF6' }) }, onError: () => show('Не удалось создать статус', 'error') })
  const deleteTier = useMutation({ mutationFn: (key: string) => api.delete(`/clients/tiers/${key}`), onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['client-tiers'] }); qc.invalidateQueries({ queryKey: ['clients'] }); if (res?.reassigned > 0) show(`Статус удалён, ${res.reassigned} клиент(ов) переведены в «Гость»`, 'success') }, onError: () => show('Не удалось удалить статус', 'error') })

  const create = useMutation({ mutationFn: (b: any) => api.post('/clients', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setShowCreate(false); setForm({ nickname: '', fullName: '', phone: '', birthday: '', clientTier: 'guest', password: '' }) }, onError: () => show('Не удалось создать клиента', 'error') })
  const update = useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/clients/${id}`, b),
    onSuccess: (res: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      // Блокировка или отвязка ТГ — закрываем/обновляем; обычное сохранение — назад в просмотр.
      if (vars?.deletedAt) { setSelected(null); setConfirmBlock(false); return }
      const merged = { ...selected, ...vars }
      delete (merged as any).deletedAt
      setSelected(merged)
      setMode('view')
    },
    onError: () => show('Не удалось сохранить изменения', 'error'),
  })
  const adjBal = useMutation({ mutationFn: ({ id, amount, reason }: any) => api.post(`/clients/${id}/balance`, { amount, reason: reason ?? 'Корректировка баланса' }), onSuccess: (_r, vars: any) => { qc.invalidateQueries({ queryKey: ['clients'] }); setSelected((s: any) => s ? { ...s, balance: parseNum(s.balance) + parseNum(vars.amount) } : s) }, onError: () => show('Не удалось изменить баланс', 'error') })
  const adjBon = useMutation({ mutationFn: ({ id, amount, reason }: any) => api.post(`/clients/${id}/bonus`, { amount, reason: reason ?? 'Корректировка бонусов' }), onSuccess: (_r, vars: any) => { qc.invalidateQueries({ queryKey: ['clients'] }); setSelected((s: any) => s ? { ...s, bonusPoints: parseNum(s.bonusPoints) + parseNum(vars.amount) } : s) }, onError: () => show('Не удалось изменить бонусы', 'error') })

  function openAdj(kind: 'balance' | 'bonus', op: 'add' | 'sub') { setAdjModal({ kind, op }); setAdjAmount(''); setAdjComment('') }
  function confirmAdj() {
    if (!selected || !adjModal) return
    const amt = Math.abs(Number(adjAmount))
    if (!(amt > 0) || adjComment.trim().length < 3) return
    const signed = adjModal.op === 'add' ? amt : -amt
    const args = { id: selected.id, amount: signed, reason: adjComment.trim() }
    if (adjModal.kind === 'balance') adjBal.mutate(args)
    else adjBon.mutate(args)
    setAdjModal(null); setAdjAmount(''); setAdjComment('')
  }
  const telegramLinkMut = useMutation({ mutationFn: (id: string) => api.post<any>(`/clients/${id}/telegram-link`, {}), onSuccess: (res: any) => { setTgQr({ deepLink: res.deepLink, qrDataUrl: res.qrDataUrl }) }, onError: () => show('Не удалось создать ссылку привязки', 'error') })

  const clients: any[] = data?.clients ?? []
  const total: number = data?.total ?? clients.length
  // Есть ли ещё страницы: загружено меньше, чем всего в выборке.
  const hasMore = clients.length < total
  const isFetchingMore = pageQueries.isFetching && page > 1

  // Tier distribution
  const tierCounts = Object.fromEntries(tierList.map(t => [t.key, clients.filter(c => (c.clientTier ?? 'guest') === t.key).length]))

  function openDetail(c: any) {
    setSelected(c)
    setMode('view')
    setTab('info')
    setTgQr(null)
    setAdjModal(null); setAdjAmount(''); setAdjComment('')
  }

  // Перевод в режим редактирования: заполняем форму из выбранного клиента.
  function startEdit() {
    if (!selected) return
    const tags: string[] = Array.isArray(selected.searchTags) ? selected.searchTags : []
    setEditForm({
      nickname: selected.nickname ?? '',
      fullName: selected.fullName ?? '',
      phone: selected.phone ?? '',
      birthday: selected.birthday ? String(selected.birthday).slice(0, 10) : '',
      clientTier: selected.clientTier ?? 'guest',
    })
    setTagsInput(tags.join(', '))
    setTgQr(null)
    setMode('edit')
  }

  function saveEdit() {
    if (!selected) return
    const searchTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    update.mutate({
      id: selected.id,
      nickname: editForm.nickname,
      fullName: editForm.fullName,
      phone: editForm.phone || null,
      birthday: editForm.birthday || null,
      clientTier: editForm.clientTier,
      searchTags,
    })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Клиенты"
        subtitle={`${total} ${total % 10 === 1 && total % 100 !== 11 ? 'игрок' : 'игроков'}`}
        action={{ label: 'Добавить', icon: 'person_add', onClick: () => setShowCreate(true) }}
      />

      {/* Search + tier chips */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по нику или телефону…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }}>
            {tierList.filter(t => (tierCounts[t.key] ?? 0) > 0).map(t => (
              <span key={t.key} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: `${t.color}22`, color: t.color, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                {t.label} {tierCounts[t.key]}
              </span>
            ))}
            <button onClick={() => setShowTiers(true)} style={{ flexShrink: 0, marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', whiteSpace: 'nowrap', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="sell" size={13} /> Статусы
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {clients.length === 0 ? (
          isLoading && !data
            ? <StateView state="loading" />
            : <StateView state="empty" icon="group" title="Клиенты не найдены" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clients.map((c: any) => {
              const tier = c.clientTier ?? 'guest'
              const tierColor = colorOf(tier)
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
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${tierColor}22`, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{labelOf(tier)}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>{c.phone ?? 'Нет телефона'}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, fontStyle: 'italic', color: 'var(--on-surface)', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(parseNum(c.balance))} ₽</p>
                    <p style={{ fontSize: 11, color: '#EAB308', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                      <Icon name="star" size={12} />{fmt(parseNum(c.bonusPoints))}
                    </p>
                  </div>
                </div>
              )
            })}
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetchingMore}
                style={{
                  width: '100%', padding: '13px 0', marginTop: 4, borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                  color: 'var(--on-surface)', fontSize: 13, fontWeight: 600,
                  cursor: isFetchingMore ? 'default' : 'pointer', opacity: isFetchingMore ? 0.6 : 1,
                }}
              >
                {isFetchingMore ? 'Загрузка…' : `Показать ещё (${clients.length} из ${total})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create sheet */}
      <Sheet open={showCreate} onClose={() => setShowCreate(false)} title="Новый клиент">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {([['Никнейм *', 'nickname', 'text'], ['Имя', 'fullName', 'text'], ['Телефон', 'phone', 'tel'], ['День рождения', 'birthday', 'date'], ['Пароль', 'password', 'password']] as [string, string, string][]).map(([lbl, key, type]) => (
            <div key={key}><label style={LBL}>{lbl}</label><input type={type} value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={INP} placeholder={key === 'fullName' ? 'Реальное имя' : undefined} /></div>
          ))}
          <div><label style={LBL}>Статус</label><select value={form.clientTier} onChange={e => setForm(p => ({ ...p, clientTier: e.target.value }))} style={{ ...INP, background: 'rgba(29,26,36,0.8)', cursor: 'pointer' } as React.CSSProperties}>{tierList.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.nickname.trim()} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: create.isPending || !form.nickname.trim() ? 0.6 : 1, marginTop: 4 }}>
            {create.isPending ? 'Создаём…' : 'Создать клиента'}
          </button>
        </div>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} maxHeight="92vh">
        {selected && (() => {
          const tier = selected.clientTier ?? 'guest'
          const tierColor = colorOf(tier)
          const bal = parseNum(selected.balance)
          const debt = bal < 0 ? -bal : 0
          const deposit = bal > 0 ? bal : 0
          const isLinked = !!(selected.tgUsername || selected.tgId)

          // ── РЕЖИМ РЕДАКТИРОВАНИЯ ──────────────────────────────────────────
          if (mode === 'edit' && editForm) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <IconButton icon="arrow_back" ariaLabel="Назад" variant="ghost" onClick={() => setMode('view')} />
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Редактирование</h2>
                </div>

                <div><label style={LBL}>Никнейм</label><input value={editForm.nickname} onChange={e => setEditForm((p: any) => ({ ...p, nickname: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>Имя</label><input value={editForm.fullName} onChange={e => setEditForm((p: any) => ({ ...p, fullName: e.target.value }))} style={INP} placeholder="Реальное имя" /></div>
                <div><label style={LBL}>Теги (через запятую)</label><input value={tagsInput} onChange={e => setTagsInput(e.target.value)} style={INP} placeholder="VIP, друг, постоянный" /></div>
                <div><label style={LBL}>Телефон</label><input type="tel" value={editForm.phone} onChange={e => setEditForm((p: any) => ({ ...p, phone: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>День рождения</label><input type="date" value={editForm.birthday} onChange={e => setEditForm((p: any) => ({ ...p, birthday: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>Статус</label><select value={editForm.clientTier} onChange={e => setEditForm((p: any) => ({ ...p, clientTier: e.target.value }))} style={{ ...INP, background: 'rgba(29,26,36,0.8)', cursor: 'pointer' } as React.CSSProperties}>{tierList.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>

                {/* Привязка телеграма */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                  <p style={{ ...LBL, marginBottom: 10 }}>Telegram</p>
                  {isLinked ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--on-surface)' }}>
                        <Icon name="telegram" size={18} color="#229ED9" />
                        Привязан: @{selected.tgUsername ?? '—'}
                      </div>
                      <Button variant="danger" fullWidth icon="link"
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: selected.id, tgId: null, tgUsername: null })}>
                        Отменить привязку
                      </Button>
                    </div>
                  ) : tgQr ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tgQr.qrDataUrl} alt="QR для привязки Telegram" width={180} height={180} style={{ borderRadius: 12, background: '#fff', padding: 6 }} />
                      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center', margin: 0 }}>Отсканируйте QR в Telegram, чтобы привязать аккаунт</p>
                      <a href={tgQr.deepLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#229ED9', textDecoration: 'none' }}>Открыть в Telegram</a>
                    </div>
                  ) : (
                    <Button variant="secondary" fullWidth icon="link"
                      loading={telegramLinkMut.isPending}
                      onClick={() => telegramLinkMut.mutate(selected.id)}>
                      Привязать телеграм
                    </Button>
                  )}
                </div>

                <Button fullWidth size="lg" loading={update.isPending} disabled={!editForm.nickname?.trim()} onClick={saveEdit}>Сохранить</Button>
                <Button variant="ghost" fullWidth onClick={() => setMode('view')}>Отмена</Button>
              </div>
            )
          }

          // ── РЕЖИМ ПРОСМОТРА ──────────────────────────────────────────────
          return (
            <div>
              {/* Шапка: фото / инициалы по центру */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 18 }}>
                {selected.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.photoUrl} alt={selected.nickname} width={88} height={88} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${tierColor}55` }} />
                ) : (
                  <div style={{ width: 88, height: 88, borderRadius: '50%', background: `${tierColor}22`, border: `2px solid ${tierColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: tierColor }}>
                    {(selected.nickname ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: '8px 0 0', textAlign: 'center' }}>{selected.nickname}</h2>
                {selected.fullName ? <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>{selected.fullName}</p> : null}
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: `${tierColor}22`, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{labelOf(tier)}</span>
              </div>

              {/* Пилюли статистики + Редактировать */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
                {([
                  ['star', 'Бонусы', fmt(parseNum(selected.bonusPoints)), '#EAB308'],
                  ['account_balance_wallet', 'Депозит', `${fmt(deposit)} ₽`, deposit > 0 ? '#10B981' : 'var(--on-surface-variant)'],
                  ['account_balance_wallet', 'Долг', `${debt > 0 ? '−' : ''}${fmt(debt)} ₽`, debt > 0 ? '#F43F5E' : 'var(--on-surface-variant)'],
                ] as [string, string, string, string][]).map(([icon, lbl, val, color]) => (
                  <div key={lbl} style={{ padding: '10px 6px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                    <Icon name={icon} size={16} color={color} style={{ display: 'block', margin: '0 auto 4px' }} />
                    <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 2px', fontFamily: "'JetBrains Mono',monospace", color }}>{val}</p>
                    <p style={{ fontSize: 9, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'JetBrains Mono',monospace" }}>{lbl}</p>
                  </div>
                ))}
                <button onClick={startEdit} style={{ padding: '10px 6px', borderRadius: 12, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon name="edit" size={16} color="#a78bfa" />
                  <span style={{ fontSize: 9, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>Изменить</span>
                </button>
              </div>

              {/* Вкладки */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                {[['info', 'Основное'], ['tx', 'Транзакции']].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k as any)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, color: tab === k ? '#8B5CF6' : 'var(--on-surface-variant)', borderBottom: tab === k ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>{l}</button>
                ))}
              </div>

              {tab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Баланс — начислить / списать */}
                  <div>
                    <p style={{ ...LBL, marginBottom: 10 }}>Баланс (₽)</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openAdj('balance', 'add')} style={adjBtnStyle('#10B981')}><Icon name="add" size={16} />Начислить</button>
                      <button onClick={() => openAdj('balance', 'sub')} style={adjBtnStyle('#F43F5E')}><Icon name="remove" size={16} />Списать</button>
                    </div>
                  </div>
                  {/* Бонусы — начислить / списать */}
                  <div>
                    <p style={{ ...LBL, marginBottom: 10 }}>Бонусы (⭐)</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openAdj('bonus', 'add')} style={adjBtnStyle('#EAB308')}><Icon name="add" size={16} />Начислить</button>
                      <button onClick={() => openAdj('bonus', 'sub')} style={adjBtnStyle('#94A3B8')}><Icon name="remove" size={16} />Списать</button>
                    </div>
                  </div>

                  {/* Контакты */}
                  <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                    <button onClick={() => selected.phone && openContact(telLink(selected.phone))} disabled={!selected.phone}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 13, fontWeight: 700, cursor: selected.phone ? 'pointer' : 'not-allowed', opacity: selected.phone ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Icon name="call" size={16} />Позвонить
                    </button>
                    <button onClick={() => selected.tgUsername && openContact(`https://t.me/${selected.tgUsername}`)} disabled={!selected.tgUsername}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid rgba(34,158,217,0.3)', background: 'rgba(34,158,217,0.1)', color: '#229ED9', fontSize: 13, fontWeight: 700, cursor: selected.tgUsername ? 'pointer' : 'not-allowed', opacity: selected.tgUsername ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Icon name="telegram" size={16} />Написать
                    </button>
                  </div>

                  {/* Блокировка */}
                  <button onClick={() => setConfirmBlock(true)} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Icon name="block" size={16} />Заблокировать
                  </button>
                </div>
              )}

              {tab === 'tx' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vpData && (vpData.isResident ? (
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <Icon name="workspace_premium" size={18} color="#a78bfa" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Статус «Резидент» · {vpData.visits} посещений</span>
                    </div>
                  ) : vpData.tier === 'guest' ? (
                    <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Гость → Резидент</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', fontFamily: "'JetBrains Mono',monospace" }}>{vpData.visits}/{vpData.threshold}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (vpData.visits / vpData.threshold) * 100)}%`, background: 'linear-gradient(90deg,#8B5CF6,#4cd7f6)', borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>
                        {vpData.remaining > 0 ? `Осталось ${vpData.remaining} ${pluralVisits(vpData.remaining)} до статуса «Резидент»` : 'Порог достигнут — статус повысится после следующего визита'}
                      </p>
                    </div>
                  ) : null)}
                  {(() => {
                    // Скрываем дубли «Долг/Оплата депозитом за чек» (withdrawal с checkId) —
                    // их представляет строка «Оплата чека». Строки с чеком — кликабельные.
                    const rows = (txData?.transactions ?? []).filter((t: any) => !(t.checkId && t.type === 'withdrawal'))
                    if (!rows.length) return <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '24px 0' }}>Нет транзакций</p>
                    return rows.map((tx: any) => {
                      const clickable = !!tx.checkId
                      const amt = parseNum(tx.amount)
                      return (
                        <div key={tx.id} onClick={() => clickable && setCheckModalId(tx.checkId)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', cursor: clickable ? 'pointer' : 'default' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                              {tx.description ?? tx.type}{clickable && <Icon name="receipt_long" size={13} color="#a78bfa" />}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{tx.createdAt ? formatDistanceToNow(new Date(tx.createdAt), { locale: ru, addSuffix: true }) : ''}</p>
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 700, fontStyle: 'italic', color: amt >= 0 ? '#10B981' : '#F43F5E', margin: 0, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
                            {amt >= 0 ? '+' : ''}{fmt(amt)} ₽
                          </p>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )
        })()}
      </Sheet>

      {/* Управление статусами */}
      <Sheet open={showTiers} onClose={() => setShowTiers(false)} title="Статусы клиентов">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Создавайте и удаляйте статусы клиентов. Системные статусы удалить нельзя.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tierList.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: t.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{t.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0', fontFamily: "'JetBrains Mono',monospace" }}>{t.key} · {tierCounts[t.key] ?? 0} клиент(ов)</p>
                </div>
                {t.isSystem ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>систем.</span>
                ) : (
                  <IconButton icon="delete" ariaLabel="Удалить статус" variant="ghost" onClick={() => deleteTier.mutate(t.key)} />
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ ...LBL, margin: 0 }}>Новый статус</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><label style={LBL}>Название</label><input value={newTier.label} onChange={e => setNewTier(p => ({ ...p, label: e.target.value }))} style={INP} placeholder="напр. VIP" /></div>
              <div><label style={LBL}>Цвет</label><input type="color" value={newTier.color.startsWith('#') ? newTier.color : '#8B5CF6'} onChange={e => setNewTier(p => ({ ...p, color: e.target.value }))} style={{ ...INP, padding: 4, width: 52, height: 44, cursor: 'pointer' } as React.CSSProperties} /></div>
            </div>
            <button onClick={() => createTier.mutate(newTier)} disabled={createTier.isPending || !newTier.label.trim()} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (createTier.isPending || !newTier.label.trim()) ? 0.6 : 1 }}>
              {createTier.isPending ? 'Создаём…' : 'Создать статус'}
            </button>
          </div>
        </div>
      </Sheet>

      {/* Модалка детали чека */}
      {checkModalId && (
        <div onClick={e => { if (e.target === e.currentTarget) setCheckModalId(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, padding: 20 }}>
            {!checkDetail ? (
              <p style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: '30px 0' }}>Загрузка…</p>
            ) : (() => {
              const ch = checkDetail.check ?? {}
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Чек</h3>
                      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{(ch.closedAt || ch.createdAt) ? new Date(ch.closedAt || ch.createdAt).toLocaleString('ru') : ''}</p>
                    </div>
                    <button onClick={() => setCheckModalId(null)} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', cursor: 'pointer', flexShrink: 0 }}><Icon name="close" size={16} /></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {(checkDetail.items ?? []).map((it: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                        <span style={{ color: 'var(--on-surface)', minWidth: 0 }}>{it.name} <span style={{ color: 'var(--on-surface-variant)' }}>×{it.quantity}</span></span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(it.lineTotal)} ₽</span>
                      </div>
                    ))}
                  </div>
                  {(checkDetail.discounts?.length ?? 0) > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {checkDetail.discounts.map((d: any) => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#F59E0B' }}>
                          <span>Скидка: {d.name}</span><span>−{fmt(d.amount)} ₽</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>Итого</span>
                    <span style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic' }}>{fmt(parseNum(ch.totalAmount))} ₽</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(checkDetail.payments ?? []).map((p: any, i: number) => (
                      <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>{PAY_LABELS[p.method] ?? p.method}: {fmt(p.amount)} ₽</span>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Модалка начисления/списания (баланс/бонусы) */}
      {adjModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setAdjModal(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 380, borderRadius: 20, padding: 22 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 16px' }}>
              {adjModal.op === 'add' ? 'Начислить' : 'Списать'} {adjModal.kind === 'balance' ? '— баланс' : '— бонусы'}
            </h3>
            <label style={LBL}>Сумма {adjModal.kind === 'balance' ? '(₽)' : '(⭐)'}</label>
            <input type="number" inputMode="numeric" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="0" autoFocus style={{ ...INP, marginBottom: 12 }} />
            <label style={LBL}>Комментарий</label>
            <input value={adjComment} onChange={e => setAdjComment(e.target.value)} placeholder="Причина (обязательно)" style={{ ...INP, marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAdjModal(null)} style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
              <button onClick={confirmAdj} disabled={!(Number(adjAmount) > 0) || adjComment.trim().length < 3}
                style={{ flex: 2, padding: '13px 0', borderRadius: 12, border: 'none', background: adjModal.op === 'add' ? 'linear-gradient(135deg,#10B981,#4cd7f6)' : 'linear-gradient(135deg,#F43F5E,#DC2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!(Number(adjAmount) > 0) || adjComment.trim().length < 3) ? 0.5 : 1 }}>
                {adjModal.op === 'add' ? 'Начислить' : 'Списать'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => selected && update.mutate({ id: selected.id, deletedAt: new Date().toISOString() })}
        title="Заблокировать клиента?"
        message={`${selected?.nickname ?? 'Клиент'} будет скрыт из списка. Это можно отменить позже.`}
        confirmLabel="Заблокировать"
        danger
        loading={update.isPending}
      />
    </div>
  )
}
