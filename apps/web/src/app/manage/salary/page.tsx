'use client'
import { useState, useRef } from 'react'
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

function calcSalary(rev: number): number {
  return Math.ceil(Math.max(0, rev - 7000) / 1000) * 100 + 700
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
  const [revenue, setRevenue] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [period, setPeriod] = useState(new Date().toISOString().split('T')[0].slice(0, 7))

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

  const idemRef = useRef(crypto.randomUUID())
  const pay = useMutation({
    // API ждёт profileId (не staffId) и не имеет поля period — period кладём в note.
    mutationFn: (body: { staffId: string; amount: number; period: string; note?: string }) =>
      api.post('/salary/pay', {
        profileId: body.staffId,
        amount: body.amount,
        note: body.note ? `${body.period}: ${body.note}` : body.period,
        idempotencyKey: idemRef.current,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary'] })
      setRevenue('')
      idemRef.current = crypto.randomUUID()
    },
    onError: () => show('Не удалось начислить зарплату', 'error'),
  })

  const staffList: StaffMember[] = staffData?.staff ?? staffData?.clients ?? []
  const payments = paymentsData?.payments ?? []

  const rev = parseFloat(revenue) || 0
  const calculated = calcSalary(rev)
  const over7k = Math.max(0, rev - 7000)
  const bonus = Math.ceil(over7k / 1000) * 100

  const currentMonthName = format(new Date(), 'LLLL yyyy', { locale: ru })

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
      <PageHeader title="Зарплаты" subtitle={currentMonthName} />

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
              <label style={LBL}>Выручка за смену (₽)</label>
              <input type="number" inputMode="decimal" placeholder="0" value={revenue} onChange={e => setRevenue(e.target.value)} style={INP} />
            </div>

            <div>
              <label style={LBL}>Период (месяц)</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={INP} />
            </div>

            {/* Result display */}
            <div style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: 34, fontWeight: 800, fontStyle: 'italic', color: 'var(--primary-violet)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                {formatMoney(calculated)}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                Базовая ставка: 700 ₽
                {rev > 0 && (<>{' '}+ бонус: {formatMoney(bonus)}{over7k > 0 && (<span style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>{' '}(⌈{over7k.toLocaleString('ru')} / 1000⌉ × 100)</span>)}</>)}
              </p>
              {rev <= 7000 && rev > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.7 }}>Выручка до 7 000 ₽ — только базовая ставка</p>
              )}
            </div>

            <Button
              fullWidth
              size="lg"
              icon="payments"
              loading={pay.isPending}
              disabled={!selectedStaffId || !revenue}
              onClick={() => pay.mutate({ staffId: selectedStaffId, amount: calculated, period, note: `Выручка ${rev.toLocaleString('ru')} ₽` })}
            >
              Начислить — {formatMoney(calculated)}
            </Button>
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
              <div key={p.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>за смену</span>
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
