'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const ROLE_LABELS: Record<string, string> = { owner: 'Владелец', staff: 'Персонал', tablet: 'Планшет', client: 'Клиент' }

export default function StaffPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nickname: '', password: '', role: 'staff' })

  const { data } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<any>('/clients?page=1').then(r => ({ staff: r.clients?.filter((p: any) => ['owner', 'staff', 'tablet'].includes(p.role)) ?? [] })),
  })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/clients', { ...body, clientTier: 'guest' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setShowForm(false) },
  })

  return (
    <ManageLayout title="Персонал" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="space-y-2">
        {data?.staff?.map((member: any) => (
          <div key={member.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {member.nickname[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{member.nickname}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</p>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новый сотрудник</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Никнейм *" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input type="password" placeholder="Пароль" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                <option value="staff">Персонал</option>
                <option value="owner">Владелец</option>
                <option value="tablet">Планшет</option>
              </select>
              <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.nickname}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">Создать</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
