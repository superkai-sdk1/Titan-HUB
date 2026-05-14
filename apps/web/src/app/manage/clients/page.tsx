'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const TIERS: Record<string, string> = { guest: 'Гость', resident: 'Резидент', student: 'Студент' }

export default function ClientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState({ nickname: '', phone: '', birthday: '', clientTier: 'guest' as const })

  const { data } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => api.get<any>(`/clients?search=${search}&page=1`),
    staleTime: 10000,
  })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/clients', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setShowForm(false) },
  })

  const adjustBalance = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/clients/${id}/balance`, { amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setSelected(null) },
  })

  const [balanceAmount, setBalanceAmount] = useState('0')

  return (
    <ManageLayout title="Клиенты" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input placeholder="Поиск по нику или телефону" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 rounded-xl bg-surface border border-border text-white placeholder-muted-foreground" />
      </div>

      <div className="space-y-2">
        {data?.clients?.map((client: any) => (
          <button key={client.id} onClick={() => setSelected(client)}
            className="w-full flex items-center gap-3 rounded-xl bg-surface border border-border p-3 text-left">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {client.nickname[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{client.nickname}</p>
              <p className="text-xs text-muted-foreground">{TIERS[client.clientTier]} · {parseFloat(client.balance).toLocaleString('ru')} ₽</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-amber-400 flex items-center gap-0.5"><Star size={10} />{parseFloat(client.bonusPoints).toFixed(0)}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Create client */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новый клиент</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Никнейм *" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input placeholder="Телефон" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input placeholder="День рождения (ГГГГ-ММ-ДД)" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <select value={form.clientTier} onChange={e => setForm(f => ({ ...f, clientTier: e.target.value as any }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                <option value="guest">Гость</option>
                <option value="resident">Резидент</option>
                <option value="student">Студент</option>
              </select>
              <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.nickname}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">
                Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Client detail */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{selected.nickname}</h2>
              <button onClick={() => setSelected(null)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between"><span className="text-muted-foreground">Уровень</span><span>{TIERS[selected.clientTier]}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Баланс</span><span className="font-semibold">{parseFloat(selected.balance).toLocaleString('ru')} ₽</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Бонусы</span><span className="text-amber-400">{parseFloat(selected.bonusPoints).toFixed(0)}</span></div>
              {selected.phone && <div className="flex justify-between"><span className="text-muted-foreground">Телефон</span><span>{selected.phone}</span></div>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Изменить баланс</p>
              <div className="flex gap-2">
                <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-white text-sm" />
                <button onClick={() => adjustBalance.mutate({ id: selected.id, amount: Number(balanceAmount) })}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium">
                  Применить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
