'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

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
  const [revenue, setRevenue] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [period, setPeriod] = useState(new Date().toISOString().split('T')[0].slice(0, 7))

  const { data: staffData } = useQuery<{ staff?: StaffMember[]; clients?: StaffMember[] }>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
  })

  const { data: paymentsData } = useQuery<{ payments: SalaryPayment[] }>({
    queryKey: ['salary'],
    queryFn: () => api.get('/salary'),
  })

  const pay = useMutation({
    mutationFn: (body: { staffId: string; amount: number; period: string; note?: string }) =>
      api.post('/salary/pay', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary'] })
      setRevenue('')
    },
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

  return (
    <div style={{ padding: '24px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Зарплаты</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>
          {currentMonthName}
        </p>
      </div>

      {/* Calculator Card */}
      <div
        className="glass-l2"
        style={{ borderRadius: 20, padding: 24, marginBottom: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary, #6750A4)', fontSize: 22 }}>calculate</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>Калькулятор зарплаты</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Staff selector */}
          <div>
            <label style={LBL}>Сотрудник</label>
            <select
              value={selectedStaffId}
              onChange={e => setSelectedStaffId(e.target.value)}
              style={SEL}
            >
              <option value="">Выбрать сотрудника</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nickname} — {ROLE_LABELS[s.role] ?? s.role}
                </option>
              ))}
            </select>
          </div>

          {/* Revenue input */}
          <div>
            <label style={LBL}>Выручка за смену (₽)</label>
            <input
              type="number"
              placeholder="0"
              value={revenue}
              onChange={e => setRevenue(e.target.value)}
              style={INP}
            />
          </div>

          {/* Period */}
          <div>
            <label style={LBL}>Период (месяц)</label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={INP}
            />
          </div>

          {/* Result display */}
          <div style={{
            background: 'rgba(103,80,164,0.12)',
            border: '1px solid rgba(103,80,164,0.25)',
            borderRadius: 14,
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary, #6750A4)', fontFamily: "'JetBrains Mono', monospace" }}>
                {calculated.toLocaleString('ru')}
              </span>
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--on-surface-variant)' }}>₽</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              Базовая ставка: 700 ₽
              {rev > 0 && (
                <>
                  {' '}+ бонус: {bonus.toLocaleString('ru')} ₽
                  {over7k > 0 && (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {' '}(⌈{over7k.toLocaleString('ru')} / 1000⌉ × 100)
                    </span>
                  )}
                </>
              )}
            </p>
            {rev <= 7000 && rev > 0 && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                Выручка до 7 000 ₽ — только базовая ставка
              </p>
            )}
          </div>

          {/* Pay button */}
          <button
            onClick={() =>
              pay.mutate({
                staffId: selectedStaffId,
                amount: calculated,
                period,
                note: `Выручка ${rev.toLocaleString('ru')} ₽`,
              })
            }
            disabled={pay.isPending || !selectedStaffId || !revenue}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              cursor: pay.isPending || !selectedStaffId || !revenue ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, var(--primary, #6750A4), #9C72CF)',
              color: '#fff', fontWeight: 600, fontSize: 15,
              opacity: pay.isPending || !selectedStaffId || !revenue ? 0.5 : 1,
              boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
            {pay.isPending ? 'Начисление...' : `Начислить зарплату — ${calculated.toLocaleString('ru')} ₽`}
          </button>
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>
          История выплат
        </h2>

        {payments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 52, display: 'block', marginBottom: 12, opacity: 0.4 }}>payments</span>
            <p style={{ margin: 0, fontSize: 15 }}>Выплат нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payments.map(p => (
              <div
                key={p.id}
                className="glass-l2"
                style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.staffName ?? 'Сотрудник'}
                    </span>
                    {p.staffRole && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: 'rgba(103,80,164,0.15)', color: 'var(--primary, #6750A4)',
                        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', flexShrink: 0,
                      }}>
                        {ROLE_LABELS[p.staffRole] ?? p.staffRole}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>за смену</span>
                    {p.period && (
                      <>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>·</span>
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{p.period}</span>
                      </>
                    )}
                    {p.note && (
                      <>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>·</span>
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {Number(p.amount).toLocaleString('ru')} ₽
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                    {formatDate(p.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
