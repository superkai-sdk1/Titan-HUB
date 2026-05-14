'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'
import { useAuthStore } from '@/store/auth.store'

export default function SalaryPage() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)

  const { data: estimate } = useQuery({
    queryKey: ['salary', 'estimate'],
    queryFn: () => api.get<any>('/salary/estimate'),
  })

  const { data: payments } = useQuery({
    queryKey: ['salary', 'payments'],
    queryFn: () => api.get<any>('/salary'),
  })

  const pay = useMutation({
    mutationFn: (body: any) => api.post('/salary/pay', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salary'] }),
  })

  return (
    <ManageLayout title="Зарплата">
      {estimate && (
        <div className="rounded-2xl bg-surface border border-border p-5 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Расчёт за период</p>
          <p className="text-3xl font-bold text-primary">{(estimate.salary ?? 0).toLocaleString('ru')} ₽</p>
          <p className="text-xs text-muted-foreground mt-1">Выручка: {parseFloat(estimate.revenue ?? 0).toLocaleString('ru')} ₽</p>
          <button
            onClick={() => pay.mutate({ profileId: user?.id, amount: estimate.salary, paymentMethod: 'cash', note: 'Авторасчёт' })}
            disabled={pay.isPending}
            className="mt-4 w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
          >
            Выплатить {(estimate.salary ?? 0).toLocaleString('ru')} ₽
          </button>
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground mb-3">История выплат</h3>
      <div className="space-y-2">
        {payments?.payments?.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl bg-surface border border-border p-3">
            <div>
              <p className="text-sm font-medium">{parseFloat(p.amount).toLocaleString('ru')} ₽</p>
              <p className="text-xs text-muted-foreground">{p.paymentMethod} {p.note && `· ${p.note}`}</p>
            </div>
            <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('ru')}</p>
          </div>
        ))}
      </div>
    </ManageLayout>
  )
}
