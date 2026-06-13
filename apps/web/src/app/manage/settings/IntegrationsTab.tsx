'use client'
/**
 * Вкладка «Интеграции» — безопасное управление токенами/ключами.
 *
 * Анти-случайность (прямое требование владельца):
 * • Секреты read-only по умолчанию — видно только статус + masked-значение из API.
 * • Сам секрет НИКОГДА не возвращается и не показывается.
 * • Изменение — только через явную «Заменить» → модалку с предупреждением.
 *   Поле ввода нового значения отдельное, не префиллится; маскированное (password).
 *   Пустое значение не отправляется (кнопка «Сохранить» disabled) — нельзя затереть.
 * • Удаление — отдельное danger-подтверждение (ConfirmDialog).
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { INP, Button, Sheet, ConfirmDialog } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface IntegrationItem {
  key: string
  label: string
  configured: boolean
  masked: string | null
}

export function IntegrationsTab() {
  const qc = useQueryClient()
  const { show } = useToast()

  // Модалка замены: какой ключ редактируется + значение в отдельном поле.
  const [editing, setEditing] = useState<IntegrationItem | null>(null)
  const [value, setValue] = useState('')
  // Подтверждение удаления — отдельный ключ.
  const [deleting, setDeleting] = useState<IntegrationItem | null>(null)

  const { data, isLoading, error } = useQuery<{ items: IntegrationItem[] }>({
    queryKey: ['integrations'],
    queryFn: () => api.get('/system/integrations'),
  })

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.patch(`/system/integrations/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Ключ обновлён', 'success')
      closeEdit()
    },
    onError: () => show('Не удалось сохранить ключ', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (key: string) => api.delete(`/system/integrations/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Ключ удалён', 'success')
      setDeleting(null)
    },
    onError: () => show('Не удалось удалить ключ', 'error'),
  })

  function openEdit(item: IntegrationItem) {
    setEditing(item)
    setValue('') // отдельное поле, никогда не префиллится
  }
  function closeEdit() {
    setEditing(null)
    setValue('')
  }

  if (isLoading && !data) return <StateView state="loading" />
  if (error) return <StateView state="error" description="Не удалось загрузить интеграции" />

  const items = data?.items ?? []
  const trimmed = value.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
        Токены и ключи хранятся в зашифрованном виде. Показывается только маскированное
        значение — изменить можно лишь через явную замену.
      </p>

      {items.map(item => (
        <div
          key={item.key}
          className="glass-l2"
          style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: item.configured ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${item.configured ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <Icon name={item.configured ? 'vpn_key' : 'key_off'} size={18} color={item.configured ? 'var(--success)' : 'var(--on-surface-variant)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>{item.label}</p>
              <p style={{
                fontSize: 12, margin: '3px 0 0',
                color: item.configured ? 'var(--success)' : 'var(--on-surface-variant)',
                fontFamily: item.configured ? "'JetBrains Mono',monospace" : undefined,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.configured ? `Подключено • ${item.masked ?? '••••'}` : 'Не настроено'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={item.configured ? 'edit' : 'add'}
              onClick={() => openEdit(item)}
              fullWidth
            >
              {item.configured ? 'Заменить' : 'Настроить'}
            </Button>
            {item.configured && (
              <Button
                variant="danger"
                size="sm"
                icon="delete"
                ariaLabel={`Удалить ${item.label}`}
                onClick={() => setDeleting(item)}
              >
                Удалить
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* Модалка замены/настройки — с предупреждением и отдельным полем ввода */}
      <Sheet
        open={!!editing}
        onClose={closeEdit}
        title={editing?.configured ? 'Заменить ключ' : 'Настроить ключ'}
        desktopSize="sm"
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'flex', gap: 10, padding: 14, borderRadius: 12,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            }}>
              <Icon name="warning" size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface)', lineHeight: 1.5 }}>
                {editing.configured
                  ? <>Текущее значение <b>{editing.label}</b> будет заменено. Старый ключ восстановить нельзя. Вставьте новое значение полностью.</>
                  : <>Введите значение <b>{editing.label}</b>. Оно сохранится в зашифрованном виде.</>}
              </p>
            </div>

            <div>
              <label style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'block',
              }}>
                Новое значение
              </label>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                style={INP}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Вставьте токен / ключ"
                onKeyDown={e => {
                  if (e.key === 'Enter' && trimmed && !saveMut.isPending) {
                    saveMut.mutate({ key: editing.key, value: trimmed })
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" fullWidth onClick={closeEdit} disabled={saveMut.isPending}>
                Отмена
              </Button>
              <Button
                variant="primary"
                fullWidth
                icon="save"
                loading={saveMut.isPending}
                // Пустое значение не сохраняется — нельзя случайно затереть ключ.
                disabled={!trimmed}
                onClick={() => saveMut.mutate({ key: editing.key, value: trimmed })}
              >
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Отдельное danger-подтверждение удаления */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutate(deleting.key)}
        title="Удалить ключ?"
        message={deleting ? `«${deleting.label}» будет удалён. Интеграция перестанет работать, пока вы не настроите ключ заново.` : undefined}
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
      />
    </div>
  )
}
