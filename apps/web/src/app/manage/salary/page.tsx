'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Button, INP, SEL, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  staff: 'Персонал',
  tablet: 'Планшет',
  client: 'Клиент',
}

interface StaffMember {
  id: string
  nickname: string
  role: string
}

interface SalaryPayment {
  id: string
  staffId: string
  staffName?: string
  staffRole?: string
  amount: number
  period?: string
  note?: string
  createdAt: string
}

export default function SalaryPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  // Зарплата — чувствительный раздел: /staff и /salary доступны только владельцу.
  // Гейтим страницу по роли (нав-гейт должен добавить platform-агент отдельно),
  // чтобы staff не упирался в битую страницу с 403-запросами.
  const role = useAuthStore(s => s.user?.role)
  const isOwner = role === 'owner'
  const [selectedStaffId, setSelectedStaffId] = useState('')
  // Бизнес-день (09:00→06:00 МСК) — по умолчанию текущий. Зарплата выдаётся ежедневно.
  const todayBiz = new Date(Date.now() + 3 * 3600 * 1000 - 9 * 3600000).toISOString().split('T')[0]
  const [day, setDay] = useState(todayBiz)
  // Сумма к выплате: '' → берём авторасчёт за день; иначе — ручное значение.
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  // При смене дня сбрасываем ручную сумму, чтобы подставился новый авторасчёт.
  useEffect(() => { setAmount('') }, [day])

  const { data: staffData } = useQuery<{ staff?: StaffMember[]; clients?: StaffMember[] }>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
    enabled: isOwner,
  })

  const { data: paymentsData, isLoading } = useQuery<{ payments: SalaryPayment[] }>({
    queryKey: ['salary'],
    queryFn: () => api.get('/salary'),
    enabled: isOwner,
  })

  // Авторасчёт за бизнес-день: выручка КЛУБА без учёта мероприятий + зарплата по формуле.
  const { data: est, isFetching: estFetching } = useQuery<{ day: string; revenue: number; salary: number }>({
    queryKey: ['salary', 'estimate', day],
    queryFn: () => api.get(`/salary/estimate?day=${day}`),
    enabled: isOwner && !!day,
  })
  const estRevenue = est?.revenue ?? 0
  const estSalary = est?.salary ?? 0
  const effectiveAmount = amount !== '' ? (parseFloat(amount) || 0) : estSalary

  const [confirming, setConfirming] = useState(false)
  const idemRef = useRef(crypto.randomUUID())
  const pay = useMutation({
    // API ждёт profileId (не staffId) и не имеет поля period — period кладём в note.
    mutationFn: (body: { staffId: string; amount: number; period: string; note?: string; paymentMethod: 'cash' | 'transfer' }) =>
      api.post('/salary/pay', {
        profileId: body.staffId,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        note: body.note ? `${body.period}: ${body.note}` : body.period,
        idempotencyKey: idemRef.current,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['cashops'] })
      setAmount('')
      setNote('')
      setConfirming(false)
      idemRef.current = crypto.randomUUID()
    },
    onError: () => { setConfirming(false); show('Не удалось начислить зарплату', 'error') },
  })

  const staffList: StaffMember[] = staffData?.staff ?? staffData?.clients ?? []
  const payments = paymentsData?.payments ?? []

  const dayLabel = (() => { try { return format(new Date(`${day}T12:00:00`), 'd MMMM yyyy', { locale: ru }) } catch { return day } })()

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: ru })
    } catch {
      return dateStr
    }
  }

  // Не владелец — раздел недоступен (а запросы и так вернут 403).
  if (!isOwner) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader title="Зарплаты" />
        <StateView
          state="error"
          icon="lock"
          title="Только для владельца"
          description="Раздел «Зарплаты» доступен только владельцу заведения."
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="Зарплаты" subtitle={`Ежедневная выплата · ${dayLabel}`} />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        {/* Calculator Card */}
        <div className="glass-l2" style={{ borderRadius: 20, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="calculate" size={22} color="var(--primary-violet)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>Калькулятор зарплаты</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={LBL}>Сотрудник</label>
              <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} style={SEL}>
                <option value="">Выбрать сотрудника</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.nickname} — {ROLE_LABELS[s.role] ?? s.role}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={LBL}>Бизнес-день</label>
              <input type="date" value={day} max={todayBiz} onChange={e => setDay(e.target.value)} style={INP} />
            </div>

            {/* Выручка клуба за бизнес-день (без мероприятий) — авто */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Выручка клуба за день · без мероприятий</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#4cd7f6', fontVariantNumeric: 'tabular-nums' }}>{estFetching && !est ? '…' : formatMoney(estRevenue)}</span>
            </div>

            <div>
              <label style={LBL}>Сумма к выплате (₽)</label>
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(estSalary)} style={INP} />
              <p style={{ margin: '6px 2px 0', fontSize: 11, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                Авторасчёт по формуле: <b style={{ color: 'var(--on-surface)' }}>{formatMoney(estSalary)}</b> — 700 ₽ + ⌈(выручка − 7 000) / 1000⌉ × 100. Можно изменить вручную.
              </p>
            </div>

            <div>
              <label style={LBL}>Комментарий (необязательно)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="например: аванс / премия" style={INP} />
            </div>

            {!confirming ? (
              <Button
                fullWidth
                size="lg"
                icon="payments"
                disabled={!selectedStaffId || !(effectiveAmount > 0)}
                onClick={() => setConfirming(true)}
              >
                Начислить — {formatMoney(effectiveAmount)}
              </Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, textAlign: 'center', color: 'var(--on-surface)' }}>
                  Способ выплаты — {formatMoney(effectiveAmount)}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    disabled={pay.isPending}
                    onClick={() => pay.mutate({ staffId: selectedStaffId, amount: effectiveAmount, period: day, note: note.trim() || undefined, paymentMethod: 'cash' })}
                    style={{ flex: 1, padding: '16px 0', borderRadius: 14, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.12)', color: '#10B981', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: pay.isPending ? 0.5 : 1 }}
                  >
                    <Icon name="payments" size={22} color="#10B981" /> Наличными
                  </button>
                  <button
                    type="button"
                    disabled={pay.isPending}
                    onClick={() => pay.mutate({ staffId: selectedStaffId, amount: effectiveAmount, period: day, note: note.trim() || undefined, paymentMethod: 'transfer' })}
                    style={{ flex: 1, padding: '16px 0', borderRadius: 14, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: 'var(--primary-violet)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: pay.isPending ? 0.5 : 1 }}
                  >
                    <Icon name="account_balance_wallet" size={22} color="#8B5CF6" /> Переводом
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--on-surface-variant)', textAlign: 'center', lineHeight: 1.4 }}>
                  Наличными — спишется из кассы. Переводом — попадёт в расходы, графа «Зарплатный фонд».
                </p>
                <button type="button" onClick={() => setConfirming(false)} disabled={pay.isPending} style={{ padding: '10px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
              </div>
            )}
          </div>
        </div>

        {/* Payment History */}
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>История выплат</h2>

        {isLoading && !paymentsData ? (
          <StateView state="loading" />
        ) : payments.length === 0 ? (
          <StateView state="empty" icon="payments" title="Выплат нет" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payments.map(p => (
              <div key={p.id} className="glass-l2" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.staffName ?? 'Сотрудник'}
                    </span>
                    {p.staffRole && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', color: 'var(--primary-violet)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', flexShrink: 0 }}>
                        {ROLE_LABELS[p.staffRole] ?? p.staffRole}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>за день</span>
                    {p.period && (<><span style={{ fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.5 }}>·</span><span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{p.period}</span></>)}
                    {p.note && (<><span style={{ fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.5 }}>·</span><span style={{ fontSize: 11, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</span></>)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount)}</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{formatDate(p.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
