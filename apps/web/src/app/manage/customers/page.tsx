'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, ConfirmDialog, INP, LBL } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { telLink, whatsappLink, telegramLink, openContact } from '@/lib/contact'

interface Customer { id: string; name: string | null; phone: string | null }

const emptyForm = { name: '', phone: '' }

export default function CustomersPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [dbSearch, setDbSearch] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDbSearch(search), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search])

  const { data, isLoading } = useQuery<{ customers: Customer[] }>({
    queryKey: ['customers', dbSearch],
    queryFn: () => api.get(`/customers${dbSearch.trim() ? `?q=${encodeURIComponent(dbSearch.trim())}` : ''}`),
  })
  const customers = data?.customers ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['customers'] })

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/customers', body),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => show('Не удалось сохранить заказчика', 'error'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/customers/${id}`, body),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => show('Не удалось сохранить заказчика', 'error'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => { setConfirmDelete(false); show('Не удалось удалить', 'error') },
  })

  function openCreate() { setSelected(null); setForm(emptyForm); setShowCreate(true) }
  function openEdit(c: Customer) { setSelected(c); setForm({ name: c.name ?? '', phone: c.phone ?? '' }); setShowCreate(true) }
  function closeSheet() { setShowCreate(false); setConfirmDelete(false); setSelected(null); setForm(emptyForm) }

  function handleSubmit() {
    const body = { name: form.name.trim() || null, phone: form.phone.trim() || null }
    if (selected) updateMut.mutate({ id: selected.id, ...body })
    else createMut.mutate(body)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader
        title="Заказчики"
        subtitle={`${customers.length} ${customers.length === 1 ? 'заказчик' : 'заказчиков'}`}
        action={{ label: 'Добавить', icon: 'person_add', onClick: openCreate }}
      />

      {/* Search */}
      <div style={{ background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', position: 'relative' }}>
          <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени или телефону…" style={{ ...INP, paddingLeft: 42, borderRadius: 12 }} />
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : customers.length === 0 ? (
          <StateView state="empty" icon="person_add" title="Заказчиков нет" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customers.map((c) => (
              <div key={c.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="person" size={20} color="#a78bfa" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Без имени'}</p>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.phone || 'Нет телефона'}</p>
                  </div>
                </div>
                {c.phone && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {([
                      ['call', '#10B981', telLink(c.phone)],
                      ['whatsapp', '#25D366', whatsappLink(c.phone)],
                      ['telegram', '#229ED9', telegramLink(c.phone)],
                    ] as [string, string, string][]).map(([icon, color, url]) => (
                      <button key={icon} aria-label={icon} onClick={() => openContact(url)}
                        style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${color}44`, background: `${color}12`, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={icon} size={17} />
                      </button>
                    ))}
                  </div>
                )}
                <button aria-label="Редактировать" onClick={() => openEdit(c)}
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="edit" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit sheet */}
      <Sheet open={showCreate} onClose={closeSheet} title={selected ? 'Редактировать заказчика' : 'Новый заказчик'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Имя</label><input style={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Имя контактного лица" /></div>
          <div><label style={LBL}>Телефон</label><input style={INP} type="tel" inputMode="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+7 900 000-00-00" /></div>
          <Button fullWidth size="lg" loading={createMut.isPending || updateMut.isPending} disabled={!form.name.trim() && !form.phone.trim()} onClick={handleSubmit}>{selected ? 'Сохранить' : 'Создать'}</Button>
          {selected && <Button variant="danger" fullWidth onClick={() => setConfirmDelete(true)}>Удалить заказчика</Button>}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => selected && deleteMut.mutate(selected.id)}
        title="Удалить заказчика?"
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
      />
    </div>
  )
}
