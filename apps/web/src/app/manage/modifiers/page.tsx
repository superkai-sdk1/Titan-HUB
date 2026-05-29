'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, ConfirmDialog, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface Modifier { id: string; name: string; price: number; productId: string }
interface MenuItem { id: string; name: string }

export default function ModifiersPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', price: '0' })
  const [search, setSearch] = useState('')

  const { data: itemsData } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get('/menu/items/all'),
  })

  const { data: modsData, isLoading: modsLoading } = useQuery<{ modifiers: Modifier[] }>({
    queryKey: ['modifiers', selectedItemId],
    queryFn: () => api.get(`/menu/items/${selectedItemId}/modifiers`),
    enabled: !!selectedItemId,
  })

  const allItems: MenuItem[] = itemsData?.items ?? []
  const mods: Modifier[] = modsData?.modifiers ?? []
  const filteredItems = allItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  const selectedItem = allItems.find(i => i.id === selectedItemId)

  const addMod = useMutation({
    mutationFn: (body: { name: string; price: number }) => api.post(`/menu/items/${selectedItemId}/modifiers`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modifiers', selectedItemId] }); setShowForm(false); setForm({ name: '', price: '0' }) },
    onError: () => show('Не удалось добавить модификатор', 'error'),
  })
  const delMod = useMutation({
    mutationFn: (modId: string) => api.delete(`/menu/items/${selectedItemId}/modifiers/${modId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modifiers', selectedItemId] }); setConfirmDelId(null) },
    onError: () => { setConfirmDelId(null); show('Не удалось удалить', 'error') },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Модификаторы"
        subtitle={selectedItem ? selectedItem.name : 'Выберите товар'}
        action={selectedItemId ? { label: 'Добавить', icon: 'add', onClick: () => setShowForm(true) } : undefined}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: item list (responsive width) */}
        <div style={{ width: 'clamp(124px, 36vw, 220px)', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 10px 8px', position: 'sticky', top: 0, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(8px)', zIndex: 5 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={16} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск…" style={{ ...INP, padding: '9px 12px 9px 32px', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ padding: '0 8px var(--bottom-nav-clear, 20px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredItems.map(item => (
              <button key={item.id} onClick={() => setSelectedItemId(item.id)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: selectedItemId === item.id ? 600 : 400, background: selectedItemId === item.id ? 'rgba(139,92,246,0.15)' : 'transparent', color: selectedItemId === item.id ? 'var(--primary-violet)' : 'var(--on-surface)' }}>
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right: modifiers */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px var(--bottom-nav-clear, 24px)' }}>
          {!selectedItemId ? (
            <StateView state="empty" icon="tune" title="Выберите товар слева" />
          ) : modsLoading && !modsData ? (
            <StateView state="loading" />
          ) : mods.length === 0 ? (
            <StateView state="empty" icon="add_circle" title="Нет модификаторов" description="Добавьте первый модификатор для этого товара." action={{ label: 'Добавить', icon: 'add', onClick: () => setShowForm(true) }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ ...LBL, margin: '0 0 12px' }}>Модификаторы · {mods.length} шт</p>
              {mods.map(mod => (
                <div key={mod.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="tune" size={18} color="var(--primary-violet)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{mod.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{mod.price > 0 ? `+${formatMoney(mod.price)}` : 'Бесплатно'}</p>
                  </div>
                  <button onClick={() => setConfirmDelId(mod.id)} aria-label="Удалить модификатор" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(251,113,133,0.2)', background: 'rgba(251,113,133,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', flexShrink: 0 }}>
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Новый модификатор" desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Например: Без льда, Доп сахар" style={INP} autoFocus /></div>
          <div><label style={LBL}>Доплата (₽)</label><input type="number" min="0" inputMode="decimal" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} style={INP} /></div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="info" size={16} color="var(--on-surface-variant)" style={{ marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>Товар: <strong style={{ color: 'var(--on-surface)' }}>{selectedItem?.name}</strong></p>
          </div>
          <Button fullWidth size="lg" loading={addMod.isPending} disabled={!form.name.trim()} onClick={() => addMod.mutate({ name: form.name, price: parseFloat(form.price) || 0 })}>Добавить</Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelId}
        onClose={() => setConfirmDelId(null)}
        onConfirm={() => confirmDelId && delMod.mutate(confirmDelId)}
        title="Удалить модификатор?"
        confirmLabel="Удалить"
        danger
        loading={delMod.isPending}
      />
    </div>
  )
}
