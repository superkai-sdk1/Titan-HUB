'use client'
/**
 * Личное уведомление клиенту: лента и push в приложении Titan Resident,
 * по желанию — дубль от бота кошелька. Доступно владельцу и сотрудникам.
 */
import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, Button, INP, LBL, ToggleRow } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'

export function ClientNotifySheet({ client, open, onClose }: {
  client: { id: string; nickname: string; tgId?: string | null } | null
  open: boolean
  onClose: () => void
}) {
  const { show } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [telegram, setTelegram] = useState(false)

  const send = useMutation({
    mutationFn: () => api.post('/client-broadcasts', {
      audience: 'profiles', profileIds: [client!.id],
      title: title.trim(), body: body.trim(), channels: { push: true, telegram },
    }),
    onSuccess: () => {
      show(`Уведомление отправлено: ${client?.nickname}`)
      setTitle(''); setBody(''); setTelegram(false)
      onClose()
    },
    onError: (e: Error) => show(e.message || 'Не удалось отправить', 'error'),
  })

  return (
    <Sheet open={open && !!client} onClose={onClose} title={`Уведомление · ${client?.nickname ?? ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={LBL}>Заголовок</label>
          <input style={INP} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="Например: Ваш столик готов" />
        </div>
        <div>
          <label style={LBL}>Текст</label>
          <textarea style={{ ...INP, minHeight: 96, resize: 'vertical', lineHeight: 1.5 }} value={body} maxLength={1000}
            onChange={e => setBody(e.target.value)} placeholder="Сообщение клиенту" />
        </div>
        <ToggleRow label="Дублировать в Telegram" subtitle={client?.tgId ? 'Сообщение от бота кошелька' : 'Telegram не привязан'}
          value={telegram && !!client?.tgId} onChange={v => setTelegram(v)} />
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
          Придёт push в приложение Titan Resident и появится в ленте уведомлений клиента.
        </p>
        <Button fullWidth icon="send" loading={send.isPending} disabled={!title.trim() || !body.trim()} onClick={() => send.mutate()}>
          Отправить
        </Button>
      </div>
    </Sheet>
  )
}
