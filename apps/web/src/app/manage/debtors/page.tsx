'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

const ACCENT = '#F43F5E' // цвет долга

function parseNum(v: unknown) { return parseFloat(String(v ?? 0)) || 0 }
function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function initials(s?: string | null) { return (s ?? '?').slice(0, 2).toUpperCase() }

export default function DebtorsPage() {
  const qc = useQueryClient()
  const { show } = useToast()

  const [selected, setSelected] = useState<any>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [opMode, setOpMode] = useState<null | 'add' | 'writeoff'>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery<{ clients: any[] }>({
    queryKey: ['clients-debtors'],
    queryFn: () => api.get('/clients?filter=debtors'),
  })
  const debtors = (data?.clients ?? []).slice().sort((a, b) => parseNum(a.balance) - parseNum(b.balance))
  const totalDebt = debtors.reduce((s, c) => s + Math.abs(parseNum(c.balance)), 0)

  // История по долгу выбранного клиента — начисления/списания баланса.
  const { data: txData } = useQuery<{ transactions: any[] }>({
    queryKey: ['debtor-tx', selected?.id],
    queryFn: () => api.get(`/clients/${selected.id}/transactions`),
    enabled: !!selected?.id,
  })
  const history = (txData?.transactions ?? []).filter((t: any) => t.type === 'deposit' || t.type === 'withdrawal')

  // Поиск клиента для добавления долга.
  useEffect(() => {
    if (!showAdd) return
    if (timer.current) clearTimeout(timer.current)
    const q = search.trim()
    if (!q) { setResults([]); setSearching(false); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get<{ clients: any[] }>(`/clients?search=${encodeURIComponent(q)}`)
        setResults(res.clients ?? [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search, showAdd])

  const adjust = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api.post(`/clients/${id}/balance`, { amount, reason }),
    onSuccess: (_r, vars: any) => {
      qc.invalidateQueries({ queryKey: ['clients-debtors'] })
      qc.invalidateQueries({ queryKey: ['debtor-tx', vars.id] })
      setSelected((s: any) => s ? { ...s, balance: parseNum(s.balance) + parseNum(vars.amount) } : s)
      setOpMode(null); setAmount(''); setNote('')
      show('Долг обновлён', 'success')
    },
    onError: (e: any) => show(e?.message || 'Не удалось изменить долг', 'error'),
  })

  function openDetail(c: any) { setSelected(c); setOpMode(null); setAmount(''); setNote('') }
  function pickClient(c: any) { setShowAdd(false); setSearch(''); setResults([]); openDetail(c) }
  function submitOp() {
    if (!selected) return
    const v = parseFloat(amount)
    if (!(v > 0)) return
    // «Добавить долг» → баланс в минус; «Списать долг» → баланс к нулю.
    // Списание ограничиваем текущим долгом, чтобы клиент не ушёл в депозит.
    const curDebt = parseNum(selected.balance) < 0 ? -parseNum(selected.balance) : 0
    const signed = opMode === 'add' ? -v : Math.min(v, curDebt)
    if (opMode === 'writeoff' && !(signed > 0)) return
    adjust.mutate({ id: selected.id, amount: signed, reason: note.trim() || (opMode === 'add' ? 'Долг (ручное начисление)' : 'Списание долга') })
  }

  const bal = selected ? parseNum(selected.balance) : 0
  const debt = bal < 0 ? -bal : 0

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Должники"
        subtitle={debtors.length > 0 ? `${debtors.length} ${debtors.length === 1 ? 'должник' : 'должников'} · ${fmt(totalDebt)} ₽` : 'Нет задолженностей'}
        action={{ label: 'Добавить', icon: 'person_add', onClick: () => { setShowAdd(true); setSearch(''); setResults([]) } }}
      />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : debtors.length === 0 ? (
          <StateView state="empty" icon="check_circle" title="Должников нет" description="Нажмите «Добавить», чтобы начислить долг клиенту." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {debtors.map((client) => (
              <div key={client.id} className="glass-l2" onClick={() => openDetail(client)}
                style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, background: `${ACCENT}22`, border: `2px solid ${ACCENT}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: ACCENT }}>
                  {initials(client.nickname)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{client.nickname}</p>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{client.fullName || client.phone || 'Без контакта'}</p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: ACCENT, margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(parseNum(client.balance))}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Добавить клиента (поиск) */}
      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Найти клиента">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Имя или ник клиента" style={INP} />
          {searching && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Поиск…</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {results.map((c: any) => (
              <button key={c.id} type="button" onClick={() => pickClient(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: `${ACCENT}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: ACCENT }}>{initials(c.nickname)}</div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nickname}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0 }}>Баланс: {formatMoney(parseNum(c.balance))}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      {/* Карточка должника */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} initialHeight="85dvh" maxHeight="94dvh">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Инфо о клиенте */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, background: `${ACCENT}22`, border: `2px solid ${ACCENT}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: ACCENT }}>
                {initials(selected.nickname)}
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{selected.nickname}</h2>
                {selected.fullName ? <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{selected.fullName}</p> : null}
                {selected.phone ? <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{selected.phone}</p> : null}
              </div>
            </div>

            {/* Текущий долг / баланс */}
            <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', textAlign: 'center', border: `1px solid ${debt > 0 ? ACCENT + '33' : 'rgba(255,255,255,0.08)'}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>{debt > 0 ? 'Долг' : 'Баланс'}</p>
              <p style={{ fontSize: 30, fontWeight: 900, color: debt > 0 ? ACCENT : 'var(--on-surface)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {debt > 0 ? `${fmt(debt)} ₽` : formatMoney(bal)}
              </p>
            </div>

            {/* Кнопки / форма операции */}
            {opMode === null ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setOpMode('add'); setAmount(''); setNote('') }}
                  style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.4)', cursor: 'pointer', background: 'rgba(244,63,94,0.1)', color: ACCENT, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="add" size={18} /> Добавить долг
                </button>
                <button onClick={() => { setOpMode('writeoff'); setAmount(debt > 0 ? String(debt) : ''); setNote('') }}
                  style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="remove" size={18} /> Списать долг
                </button>
              </div>
            ) : (
              <div className="glass-l2" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: opMode === 'add' ? ACCENT : '#10B981' }}>
                  {opMode === 'add' ? 'Начислить долг' : 'Списать (погасить) долг'}
                </p>
                <div><label style={LBL}>Сумма (₽)</label>
                  <input type="number" inputMode="decimal" min="0" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="например 500" style={INP} /></div>
                <div><label style={LBL}>Причина / заметка (необязательно)</label>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder={opMode === 'add' ? 'Долг (ручное начисление)' : 'Списание долга'} style={INP} /></div>
                <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                  <Button variant="ghost" fullWidth onClick={() => { setOpMode(null); setAmount(''); setNote('') }}>Отмена</Button>
                  <Button fullWidth loading={adjust.isPending} disabled={!(parseFloat(amount) > 0)} onClick={submitOp}>
                    {opMode === 'add' ? 'Начислить долг' : 'Списать'}
                  </Button>
                </div>
              </div>
            )}

            {/* История */}
            <div>
              <p style={{ ...LBL, marginBottom: 10 }}>История</p>
              {history.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(204,195,216,0.4)', textAlign: 'center', padding: '16px 0' }}>Пока нет операций</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.map((tx: any) => {
                    // deposit (+) уменьшает долг — зелёным; withdrawal (−) увеличивает — красным.
                    const credit = tx.type === 'deposit'
                    const amt = parseNum(tx.amount)
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{tx.description || (credit ? 'Погашение' : 'Начисление долга')}</p>
                          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{tx.createdAt ? formatDistanceToNow(new Date(tx.createdAt), { locale: ru, addSuffix: true }) : ''}</p>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: credit ? '#10B981' : ACCENT, margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>
                          {credit ? '+' : '−'}{fmt(amt)} ₽
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
