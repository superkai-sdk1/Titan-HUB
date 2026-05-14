'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Edit2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const TYPE_LABELS: Record<string, string> = { small_booth: 'Малая кабинка', large_booth: 'Большая кабинка', hall: 'Зал' }

export default function SpacesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', type: 'small_booth', hourlyRate: '0', isActive: true })

  const { data } = useQuery({ queryKey: ['spaces'], queryFn: () => api.get<any>('/spaces/all') })

  const save = useMutation({
    mutationFn: (body: any) => editing ? api.patch(`/spaces/${editing.id}`, body) : api.post('/spaces', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setShowForm(false); setEditing(null) },
  })

  function openEdit(s: any) {
    setEditing(s)
    setForm({ name: s.name, type: s.type, hourlyRate: s.hourlyRate, isActive: s.isActive })
    setShowForm(true)
  }

  return (
    <ManageLayout title="Зоны" action={<button onClick={() => { setEditing(null); setForm({ name: '', type: 'small_booth', hourlyRate: '0', isActive: true }); setShowForm(true) }} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="space-y-2">
        {data?.spaces?.map((space: any) => (
          <div key={space.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{space.name}</p>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[space.type]} · {parseFloat(space.hourlyRate).toLocaleString('ru')} ₽/ч</p>
            </div>
            <button onClick={() => openEdit(space)} className="p-2 text-muted-foreground"><Edit2 size={16} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{editing ? 'Редактировать' : 'Новая зона'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Название *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" placeholder="Ставка в час" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <button onClick={() => save.mutate({ ...form, hourlyRate: Number(form.hourlyRate) })} disabled={save.isPending || !form.name}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
