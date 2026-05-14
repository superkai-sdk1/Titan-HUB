'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

export default function MenuPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', price: '0', category: '', isActive: true, isTop: false, trackStock: false, stockQuantity: '0' })

  const { data: cats } = useQuery({ queryKey: ['menu', 'categories'], queryFn: () => api.get<any>('/menu/categories') })
  const { data: items } = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: () => api.get<any>('/menu/items/all') })

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? api.patch(`/menu/items/${editing.id}`, body)
      : api.post('/menu/items', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu', 'items'] }); setShowForm(false); setEditing(null) },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] }),
  })

  function openEdit(item: any) {
    setEditing(item)
    setForm({ name: item.name, price: item.price, category: item.category ?? '', isActive: item.isActive, isTop: item.isTop, trackStock: item.trackStock, stockQuantity: String(item.stockQuantity) })
    setShowForm(true)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', price: '0', category: '', isActive: true, isTop: false, trackStock: false, stockQuantity: '0' })
    setShowForm(true)
  }

  return (
    <ManageLayout title="Меню" action={<button onClick={openCreate} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="flex rounded-xl bg-surface mb-4 p-1">
        {(['items', 'categories'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium ${activeTab === t ? 'bg-primary text-white' : 'text-muted-foreground'}`}>
            {t === 'items' ? 'Товары' : 'Категории'}
          </button>
        ))}
      </div>

      {activeTab === 'items' && (
        <div className="space-y-2">
          {items?.items?.map((item: any) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{parseFloat(item.price).toLocaleString('ru')} ₽ {!item.isActive && '· неактивен'}</p>
              </div>
              <button onClick={() => openEdit(item)} className="p-2 text-muted-foreground"><Edit2 size={16} /></button>
              <button onClick={() => del.mutate(item.id)} className="p-2 text-red-400"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-2">
          {cats?.categories?.map((cat: any) => (
            <div key={cat.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
              <span className="text-xl">{cat.icon}</span>
              <p className="text-sm font-medium flex-1">{cat.name}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{editing ? 'Редактировать' : 'Новый товар'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Название" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <input type="number" placeholder="Цена" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                <option value="">Без категории</option>
                {cats?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={form.trackStock} onChange={e => setForm(f => ({ ...f, trackStock: e.target.checked }))} />
                <span className="text-sm">Учёт склада</span>
              </label>
              {form.trackStock && (
                <input type="number" placeholder="Количество" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
              )}
              <button
                onClick={() => save.mutate({ ...form, price: Number(form.price), stockQuantity: Number(form.stockQuantity) })}
                disabled={save.isPending || !form.name}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
              >Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
