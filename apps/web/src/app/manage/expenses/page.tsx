'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const CATEGORIES: Record<string, string> = {
  rent: 'Аренда', utilities: 'Коммунальные', supplies: 'Поставки',
  salary: 'Зарплата', marketing: 'Маркетинг', equipment: 'Оборудование', other: 'Другое',
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: 'other', amount: '', description: '', expenseDate: new Date().toISOString().split('T')[0] })

  const { data } = useQuery({ queryKey: ['expenses'], queryFn: () => api.get<any>('/expenses') })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/expenses', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setShowForm(false) },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const total = data?.expenses?.reduce((s: number, e: any) => s + parseFloat(e.amount), 0) ?? 0

  return (
    <ManageLayout title="Расходы" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="rounded-2xl bg-surface border border-border p-4 mb-4">
        <p className="text-xs text-muted-foreground">Всего расходов</p>
        <p className="text-2xl font-bold">{total.toLocaleString('ru')} ₽</p>
      </div>

      <div className="space-y-2">
        {data?.expenses?.map((exp: any) => (
          <div key={exp.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{CATEGORIES[exp.category]}</p>
              <p className="text-xs text-muted-foreground">{exp.expenseDate} {exp.description && `· ${exp.description}`}</p>
            </div>
            <p className="text-sm font-semibold text-red-400">−{parseFloat(exp.amount).toLocaleString('ru')} ₽</p>
            <button onClick={() => del.mutate(exp.id)} className="p-1.5 text-muted-foreground"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новый расход</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" placeholder="Сумма *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input placeholder="Описание" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <button onClick={() => create.mutate({ ...form, amount: Number(form.amount) })} disabled={create.isPending || !form.amount}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
