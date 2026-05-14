'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

export default function SuppliesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [lines, setLines] = useState<{ itemId: string; quantity: string; costPerUnit: string }[]>([{ itemId: '', quantity: '1', costPerUnit: '0' }])

  const { data } = useQuery({ queryKey: ['supplies'], queryFn: () => api.get<any>('/supplies') })
  const { data: items } = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: () => api.get<any>('/menu/items/all') })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/supplies', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setShowForm(false) },
  })

  function addLine() { setLines(l => [...l, { itemId: '', quantity: '1', costPerUnit: '0' }]) }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)) }

  return (
    <ManageLayout title="Поставки" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="space-y-2">
        {data?.supplies?.map((s: any) => (
          <div key={s.id} className="rounded-xl bg-surface border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{new Date(s.createdAt).toLocaleDateString('ru')}</p>
              <p className="text-sm font-semibold">{parseFloat(s.totalCost).toLocaleString('ru')} ₽</p>
            </div>
            {s.note && <p className="text-xs text-muted-foreground mt-1">{s.note}</p>}
            <p className="text-xs text-muted-foreground">{s.paymentMethod}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новая поставка</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              {lines.map((line, i) => (
                <div key={i} className="p-3 rounded-xl bg-background border border-border space-y-2">
                  <select value={line.itemId} onChange={e => setLines(l => l.map((r, idx) => idx === i ? { ...r, itemId: e.target.value } : r))}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm">
                    <option value="">Выберите товар</option>
                    {items?.items?.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Кол-во" value={line.quantity} onChange={e => setLines(l => l.map((r, idx) => idx === i ? { ...r, quantity: e.target.value } : r))}
                      className="px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm" />
                    <input type="number" placeholder="Цена/ед." value={line.costPerUnit} onChange={e => setLines(l => l.map((r, idx) => idx === i ? { ...r, costPerUnit: e.target.value } : r))}
                      className="px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm" />
                  </div>
                  {lines.length > 1 && <button onClick={() => removeLine(i)} className="text-red-400 text-xs flex items-center gap-1"><Trash2 size={12} />Удалить</button>}
                </div>
              ))}
              <button onClick={addLine} className="text-primary text-sm flex items-center gap-1"><Plus size={16} />Добавить позицию</button>
              <input placeholder="Заметка" value={note} onChange={e => setNote(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="transfer">Перевод</option>
              </select>
              <button
                onClick={() => create.mutate({ note, paymentMethod, items: lines.map(l => ({ itemId: l.itemId, quantity: Number(l.quantity), costPerUnit: Number(l.costPerUnit) })) })}
                disabled={create.isPending || lines.some(l => !l.itemId)}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
