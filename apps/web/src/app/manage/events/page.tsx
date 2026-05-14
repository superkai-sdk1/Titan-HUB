'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const STATUS_LABELS: Record<string, string> = { planned: 'Запланировано', active: 'Активно', completed: 'Завершено', cancelled: 'Отменено' }
const STATUS_COLORS: Record<string, string> = { planned: 'text-blue-400', active: 'text-green-400', completed: 'text-muted-foreground', cancelled: 'text-red-400' }

export default function EventsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'titan', date: new Date().toISOString().split('T')[0], startTime: '18:00', endTime: '', fixedAmount: '', paymentType: 'fixed', comment: '' })

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/events', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false) },
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/events/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })

  return (
    <ManageLayout title="События" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="space-y-2">
        {data?.events?.map((event: any) => (
          <div key={event.id} className="rounded-xl bg-surface border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{event.type === 'titan' ? 'Titan' : 'Выезд'} · {event.date}</p>
                <p className="text-xs text-muted-foreground">{event.startTime}{event.endTime && ` — ${event.endTime}`}</p>
                {event.comment && <p className="text-xs text-muted-foreground mt-1">{event.comment}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs ${STATUS_COLORS[event.status]}`}>{STATUS_LABELS[event.status]}</span>
                {event.fixedAmount && <span className="text-xs font-semibold">{parseFloat(event.fixedAmount).toLocaleString('ru')} ₽</span>}
              </div>
            </div>
            {event.status === 'planned' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => update.mutate({ id: event.id, status: 'active' })}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">Начать</button>
                <button onClick={() => update.mutate({ id: event.id, status: 'cancelled' })}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">Отмена</button>
              </div>
            )}
            {event.status === 'active' && (
              <button onClick={() => update.mutate({ id: event.id, status: 'completed' })}
                className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Завершить</button>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новое событие</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                <option value="titan">Titan</option>
                <option value="exit">Выезд</option>
              </select>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className="px-4 py-3 rounded-xl bg-background border border-border text-white" />
                <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="px-4 py-3 rounded-xl bg-background border border-border text-white" placeholder="Конец" />
              </div>
              <input type="number" placeholder="Сумма" value={form.fixedAmount} onChange={e => setForm(f => ({ ...f, fixedAmount: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <textarea placeholder="Комментарий" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white resize-none" rows={2} />
              <button onClick={() => create.mutate({ ...form, fixedAmount: form.fixedAmount ? Number(form.fixedAmount) : undefined })}
                disabled={create.isPending}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">Создать</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
