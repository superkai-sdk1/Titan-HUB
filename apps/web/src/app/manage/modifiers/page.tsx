'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const SEL: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block',
}

interface Modifier { id: string; name: string; price: number; productId: string }
interface MenuItem { id: string; name: string }

export default function ModifiersPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', price: '0' })
  const [search, setSearch] = useState('')

  const { data: itemsData } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu', 'items', 'all'],
    queryFn: () => api.get('/menu/items/all'),
  })

  const { data: modsData } = useQuery<{ modifiers: Modifier[] }>({
    queryKey: ['modifiers', selectedItemId],
    queryFn: () => api.get(`/menu/items/${selectedItemId}/modifiers`),
    enabled: !!selectedItemId,
  })

  const allItems: MenuItem[] = itemsData?.items ?? []
  const mods: Modifier[] = modsData?.modifiers ?? []

  const filteredItems = allItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()),
  )

  const addMod = useMutation({
    mutationFn: (body: { name: string; price: number }) =>
      api.post(`/menu/items/${selectedItemId}/modifiers`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modifiers', selectedItemId] })
      setShowForm(false)
      setForm({ name: '', price: '0' })
    },
  })

  const delMod = useMutation({
    mutationFn: (modId: string) =>
      api.delete(`/menu/items/${selectedItemId}/modifiers/${modId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modifiers', selectedItemId] }),
  })

  const selectedItem = allItems.find(i => i.id === selectedItemId)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Модификаторы</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
              {selectedItem ? selectedItem.name : 'Выберите товар'}
            </p>
          </div>
          {selectedItemId && (
            <button
              onClick={() => setShowForm(true)}
              style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="add" size={18} color="#fff" />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Item list */}
        <div style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 12px 8px', position: 'sticky', top: 0, background: 'rgba(21,18,27,0.9)', zIndex: 5 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={16} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск…"
                style={{ ...INP, paddingLeft: 34, padding: '8px 12px 8px 32px', fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ padding: '0 8px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: selectedItemId === item.id ? 600 : 400,
                  background: selectedItemId === item.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: selectedItemId === item.id ? '#8B5CF6' : 'var(--on-surface)',
                  transition: 'all 0.15s',
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Modifiers */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 80px' }}>
          {!selectedItemId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--on-surface-variant)' }}>
              <Icon name="tune" size={48} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: 0 }}>Выберите товар слева</p>
            </div>
          ) : mods.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12, color: 'var(--on-surface-variant)' }}>
              <Icon name="add_circle" size={48} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: 0 }}>Нет модификаторов</p>
              <button
                onClick={() => setShowForm(true)}
                style={{ padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                Добавить первый
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ ...LBL, margin: '0 0 12px' }}>Модификаторы · {mods.length} шт</p>
              {mods.map(mod => (
                <div key={mod.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="tune" size={18} color="#8B5CF6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{mod.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
                      {mod.price > 0 ? `+${mod.price.toLocaleString('ru')} ₽` : 'Бесплатно'}
                    </p>
                  </div>
                  <button
                    onClick={() => delMod.mutate(mod.id)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add modifier form */}
      {showForm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Новый модификатор</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LBL}>Название *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Например: Без льда, Доп сахар"
                  style={INP}
                />
              </div>
              <div>
                <label style={LBL}>Доплата (₽)</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  style={INP}
                />
              </div>
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="info" size={16} color="var(--on-surface-variant)" style={{ marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                  Товар: <strong style={{ color: 'var(--on-surface)' }}>{selectedItem?.name}</strong>
                </p>
              </div>
              <button
                onClick={() => addMod.mutate({ name: form.name, price: parseFloat(form.price) || 0 })}
                disabled={addMod.isPending || !form.name.trim()}
                style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: !form.name.trim() ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: !form.name.trim() ? 0.6 : 1 }}
              >
                {addMod.isPending ? 'Добавляем…' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
