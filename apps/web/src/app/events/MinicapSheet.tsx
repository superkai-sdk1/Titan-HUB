'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'

// Поиск/добавление игроков (тот же эндпоинт, что и на кассе), дебаунс 300мс.
function PlayerSearch({ onPick, exclude, placeholder }: { onPick: (p: { id: string; nickname: string }) => void; exclude: Set<string>; placeholder: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; nickname: string; clientTier?: string }[]>([])
  const [creating, setCreating] = useState(false)
  const [newNick, setNewNick] = useState('')
  const [newTier, setNewTier] = useState('guest')
  const timer = useRef<any>(null)
  const qc = useQueryClient()
  const { show } = useToast()

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (!term) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try { const r = await api.get<{ players: any[] }>(`/pos/players/search?q=${encodeURIComponent(term)}`); setResults(r.players ?? []) }
      catch { setResults([]) }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  const createClient = useMutation({
    mutationFn: () => api.post<{ client: { id: string; nickname: string } }>('/clients', { nickname: newNick.trim(), clientTier: newTier }),
    onSuccess: (r) => { onPick(r.client); setCreating(false); setNewNick(''); setQ(''); setResults([]); qc.invalidateQueries({ queryKey: ['clients'] }) },
    onError: (e: any) => show(e?.message ?? 'Не удалось создать игрока', 'error'),
  })

  const TIERS: [string, string][] = [['guest', 'Гость'], ['resident', 'Резидент'], ['student', 'Студент']]

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={INP} />
      {q.trim() !== '' && (
        <div style={{ marginTop: 6, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {results.filter(p => !exclude.has(p.id)).map(p => (
            <button key={p.id} type="button" onClick={() => { onPick(p); setQ(''); setResults([]) }}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
              <Icon name="person" size={16} color="#a78bfa" />
              <span style={{ flex: 1 }}>{p.nickname}</span>
              <Icon name="add" size={16} color="#10B981" />
            </button>
          ))}
          {!creating ? (
            <button type="button" onClick={() => { setCreating(true); setNewNick(q.trim()) }}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: '#10B981', fontWeight: 600 }}>
              <Icon name="person_add" size={16} /> Создать игрока «{q.trim()}»
            </button>
          ) : (
            <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="Никнейм" style={INP} />
              <div style={{ display: 'flex', gap: 6 }}>
                {TIERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setNewTier(k)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1px solid ${newTier === k ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: newTier === k ? 'rgba(139,92,246,0.15)' : 'transparent', color: newTier === k ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setCreating(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
                <button type="button" disabled={createClient.isPending || newNick.trim().length < 2} onClick={() => createClient.mutate()}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (createClient.isPending || newNick.trim().length < 2) ? 0.5 : 1 }}>Создать и добавить</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props { open: boolean; onClose: () => void; eventId: string | null; onSaved?: () => void }

// eventId === null → создание; иначе — управление существующим миникапом.
export function MinicapSheet({ open, onClose, eventId, onSaved }: Props) {
  const qc = useQueryClient()
  const { show } = useToast()
  const mode = eventId ? 'manage' : 'create'

  const today = new Date().toISOString().split('T')[0]
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [startTime, setStartTime] = useState('18:00')
  const [fee, setFee] = useState('')
  const [prize, setPrize] = useState(''); const [showPrize, setShowPrize] = useState(false)
  const [lunch, setLunch] = useState(''); const [showLunch, setShowLunch] = useState(false)
  const [other, setOther] = useState(''); const [showOther, setShowOther] = useState(false)
  // Локальный ростер для режима создания.
  const [roster, setRoster] = useState<{ id: string; nickname: string }[]>([])
  const [judge, setJudge] = useState<{ id: string; nickname: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Данные существующего миникапа (manage).
  const { data: evData } = useQuery({ queryKey: ['events', eventId], queryFn: () => api.get<{ event: any }>(`/events/${eventId}`), enabled: open && !!eventId })
  const ev = evData?.event
  const { data: partData } = useQuery({ queryKey: ['events', eventId, 'participants'], queryFn: () => api.get<{ participants: any[] }>(`/events/${eventId}/participants`), enabled: open && !!eventId })
  const participants: any[] = partData?.participants ?? []

  useEffect(() => {
    if (open && ev) {
      setTitle(ev.title ?? ''); setDate(ev.date ?? today); setStartTime(ev.startTime ?? '18:00')
      setFee(ev.participationFee != null ? String(ev.participationFee) : '')
      setPrize(ev.prizeFund != null ? String(ev.prizeFund) : ''); setShowPrize(ev.prizeFund != null)
      setLunch(ev.lunchCost != null ? String(ev.lunchCost) : ''); setShowLunch(ev.lunchCost != null)
      setOther(ev.otherCost != null ? String(ev.otherCost) : ''); setShowOther(ev.otherCost != null)
    }
    if (open && mode === 'create') { /* reset handled on close */ }
  }, [open, ev]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setTitle(''); setDate(today); setStartTime('18:00'); setFee(''); setPrize(''); setShowPrize(false); setLunch(''); setShowLunch(false); setOther(''); setShowOther(false); setRoster([]); setJudge(null); setErr(null) }

  // ── Создание ────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        format: 'minicap', type: 'titan', title: title.trim() || null, location: 'TITAN',
        date, startTime, paymentType: 'fixed', billingMode: 'amount',
        participationFee: fee ? parseFloat(fee) : null,
        prizeFund: showPrize && prize ? parseFloat(prize) : null,
        lunchCost: showLunch && lunch ? parseFloat(lunch) : null,
        otherCost: showOther && other ? parseFloat(other) : null,
      }
      const { event } = await api.post<{ event: any }>('/events', payload)
      for (const p of roster) await api.post(`/events/${event.id}/participants`, { profileId: p.id, role: 'player' })
      if (judge) await api.post(`/events/${event.id}/participants`, { profileId: judge.id, role: 'judge' })
      return event
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); reset(); onSaved?.(); onClose() },
    onError: (e: any) => setErr(e?.message ?? 'Не удалось создать миникап'),
  })

  // ── Управление ──────────────────────────────────────────────────────────
  const patchEvent = useMutation({
    mutationFn: (body: any) => api.patch(`/events/${eventId}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['events', eventId] }); qc.invalidateQueries({ queryKey: ['events', eventId, 'participants'] }) },
    onError: (e: any) => show(e?.message ?? 'Ошибка сохранения', 'error'),
  })
  const addParticipant = useMutation({
    mutationFn: (b: { profileId: string; role: string }) => api.post(`/events/${eventId}/participants`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'participants'] }),
    onError: (e: any) => show(e?.message ?? 'Не удалось добавить', 'error'),
  })
  const patchParticipant = useMutation({
    mutationFn: ({ pid, prepaid }: { pid: string; prepaid: boolean }) => api.patch(`/events/${eventId}/participants/${pid}`, { prepaid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'participants'] }),
    onError: (e: any) => show(e?.message ?? 'Ошибка', 'error'),
  })
  const delParticipant = useMutation({
    mutationFn: (pid: string) => api.delete(`/events/${eventId}/participants/${pid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', eventId, 'participants'] }),
    onError: (e: any) => show(e?.message ?? 'Не удалось убрать', 'error'),
  })
  const start = useMutation({
    mutationFn: () => api.patch(`/events/${eventId}`, { status: 'active' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['events', eventId, 'participants'] }) },
    onError: (e: any) => show(e?.message ?? 'Не удалось начать', 'error'),
  })

  const players = participants.filter(p => p.role === 'player')
  const manageJudge = participants.find(p => p.role === 'judge')
  const excludeIds = new Set<string>([
    ...(mode === 'create' ? roster.map(r => r.id) : players.map(p => p.profileId)),
    ...(mode === 'create' ? (judge ? [judge.id] : []) : (manageJudge ? [manageJudge.profileId] : [])),
  ])

  const saveCosts = () => patchEvent.mutate({
    title: title.trim() || null, date, startTime,
    participationFee: fee ? parseFloat(fee) : null,
    prizeFund: showPrize && prize ? parseFloat(prize) : null,
    lunchCost: showLunch && lunch ? parseFloat(lunch) : null,
    otherCost: showOther && other ? parseFloat(other) : null,
  })

  const CostBtn = ({ on, setOn, label, color }: { on: boolean; setOn: (v: boolean) => void; label: string; color: string }) => (
    <button type="button" onClick={() => setOn(!on)}
      style={{ flex: 1, padding: '10px 6px', borderRadius: 11, border: `1px solid ${on ? color : 'rgba(255,255,255,0.1)'}`, background: on ? `${color}1f` : 'rgba(255,255,255,0.03)', color: on ? color : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'create' ? 'Новый миникап' : (ev?.title || 'Миникап')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Основное */}
        <div><label style={LBL}>Название</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Напр. Миникап #12" style={INP} /></div>
        <div><label style={LBL}>Локация</label><input value="TITAN" disabled style={{ ...INP, opacity: 0.7 }} /></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><label style={LBL}>Дата</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={INP} /></div>
          <div style={{ flex: 1 }}><label style={LBL}>Начало</label><input value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="18:00" style={INP} /></div>
        </div>
        <div><label style={LBL}>Стоимость участия (₽)</label><input type="number" inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} placeholder="0" style={INP} /></div>

        {/* Расходы */}
        <div>
          <label style={LBL}>Расходы миникапа</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <CostBtn on={showPrize} setOn={setShowPrize} label="Призовой фонд" color="#EC4899" />
            <CostBtn on={showLunch} setOn={setShowLunch} label="Обед" color="#F59E0B" />
            <CostBtn on={showOther} setOn={setShowOther} label="Иные" color="#4cd7f6" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {showPrize && <input type="number" inputMode="numeric" value={prize} onChange={e => setPrize(e.target.value)} placeholder="Призовой фонд, ₽" style={INP} />}
            {showLunch && <input type="number" inputMode="numeric" value={lunch} onChange={e => setLunch(e.target.value)} placeholder="Обед, ₽" style={INP} />}
            {showOther && <input type="number" inputMode="numeric" value={other} onChange={e => setOther(e.target.value)} placeholder="Иные расходы, ₽" style={INP} />}
          </div>
        </div>

        {/* Судья */}
        <div>
          <label style={LBL}>Судья</label>
          {mode === 'create' ? (
            judge ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Icon name="gavel" size={16} color="#F59E0B" /><span style={{ flex: 1, fontWeight: 600 }}>{judge.nickname}</span>
                <button type="button" onClick={() => setJudge(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171' }}><Icon name="close" size={16} /></button>
              </div>
            ) : <PlayerSearch onPick={(p) => setJudge(p)} exclude={excludeIds} placeholder="Найти судью…" />
          ) : (
            manageJudge ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Icon name="gavel" size={16} color="#F59E0B" /><span style={{ flex: 1, fontWeight: 600 }}>{manageJudge.nickname}</span>
                <button type="button" onClick={() => delParticipant.mutate(manageJudge.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171' }}><Icon name="close" size={16} /></button>
              </div>
            ) : <PlayerSearch onPick={(p) => addParticipant.mutate({ profileId: p.id, role: 'judge' })} exclude={excludeIds} placeholder="Найти судью…" />
          )}
        </div>

        {/* Игроки */}
        <div>
          <label style={LBL}>Игроки ({mode === 'create' ? roster.length : players.length}/10)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {(mode === 'create' ? roster.map(r => ({ id: r.id, pid: r.id, nickname: r.nickname, prepaid: false, checkId: null, checkTotal: null })) : players.map(p => ({ id: p.id, pid: p.profileId, nickname: p.nickname, prepaid: p.prepaid, checkId: p.checkId, checkTotal: p.checkTotal }))).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', width: 18 }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname}</span>
                {mode === 'manage' && (
                  <button type="button" onClick={() => patchParticipant.mutate({ pid: p.id, prepaid: !p.prepaid })}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9, border: `1px solid ${p.prepaid ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)'}`, background: p.prepaid ? 'rgba(16,185,129,0.12)' : 'transparent', color: p.prepaid ? '#10B981' : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <Icon name={p.prepaid ? 'check_circle' : 'radio_button_unchecked'} size={14} /> Оплатил
                  </button>
                )}
                {p.checkTotal != null && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{parseFloat(p.checkTotal).toLocaleString('ru')} ₽</span>}
                <button type="button"
                  onClick={() => { if (mode === 'create') setRoster(roster.filter(r => r.id !== p.id)); else delParticipant.mutate(p.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171' }}><Icon name="close" size={16} /></button>
              </div>
            ))}
          </div>
          {((mode === 'create' ? roster.length : players.length) < 10) && (
            <PlayerSearch
              onPick={(p) => { if (mode === 'create') setRoster([...roster, p]); else addParticipant.mutate({ profileId: p.id, role: 'player' }) }}
              exclude={excludeIds} placeholder="Найти игрока… (или создать)" />
          )}
        </div>

        {err && <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#F87171', fontSize: 12 }}>{err}</div>}

        {mode === 'create' ? (
          <button onClick={() => create.mutate()} disabled={create.isPending}
            style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: create.isPending ? 0.6 : 1 }}>
            {create.isPending ? 'Создаём…' : 'Создать миникап'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={saveCosts} disabled={patchEvent.isPending}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Сохранить (сумму/расходы)
            </button>
            {ev?.status === 'planned' && (
              <button onClick={() => start.mutate()} disabled={start.isPending || players.length === 0}
                style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #10B981, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: (start.isPending || players.length === 0) ? 0.6 : 1 }}>
                <Icon name="play_arrow" size={18} /> Начать миникап (открыть счета)
              </button>
            )}
            {ev?.status === 'active' && (
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', textAlign: 'center', margin: 0 }}>Счета участников открыты в кассе POS. Позиции меню добавляются там.</p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
