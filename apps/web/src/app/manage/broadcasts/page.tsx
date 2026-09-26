'use client'
/**
 * «Рассылки» — сообщения клиентам клуба: лента и push в приложении Titan Resident,
 * по желанию — дубль от бота кошелька в Telegram. Массовые рассылки — владельцу.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Button, ConfirmDialog, INP, LBL, ToggleRow, Chip } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

type Audience = 'all' | 'tier' | 'debtors' | 'depositors'
interface TierRow { key: string; label: string; color: string }
interface AudienceStats { recipients: number; withApp: number; withTelegram: number }
interface BroadcastRow {
  id: string; title: string; body: string; audience: string
  channels: { push?: boolean; telegram?: boolean }
  recipientsCount: number; pushCount: number; telegramCount: number
  createdAt: string; sentBy: string | null
}

const AUDIENCES: { key: Audience; label: string; icon: string }[] = [
  { key: 'all', label: 'Все клиенты', icon: 'group' },
  { key: 'tier', label: 'По статусу', icon: 'workspace_premium' },
  { key: 'debtors', label: 'Должники', icon: 'trending_down' },
  { key: 'depositors', label: 'С депозитом', icon: 'account_balance_wallet' },
]

function audienceLabel(a: string, tiers: TierRow[]): string {
  if (a.startsWith('tier:')) return tiers.find(t => t.key === a.slice(5))?.label ?? 'Статус'
  return ({ all: 'Все клиенты', debtors: 'Должники', depositors: 'С депозитом', profiles: 'Выбранные' } as Record<string, string>)[a] ?? a
}

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export default function BroadcastsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { show } = useToast()
  const [audience, setAudience] = useState<Audience>('all')
  const [tier, setTier] = useState<string>('resident')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [push, setPush] = useState(true)
  const [telegram, setTelegram] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const { data: tiersData } = useQuery({ queryKey: ['client-tiers'], queryFn: () => api.get<{ tiers: TierRow[] }>('/clients/tiers') })
  const tiers = tiersData?.tiers ?? []
  const target = { audience, ...(audience === 'tier' ? { tier } : {}) }

  const { data: stats } = useQuery({
    queryKey: ['broadcast-audience', audience, tier],
    queryFn: () => api.post<AudienceStats>('/client-broadcasts/audience', target),
  })
  const history = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get<{ broadcasts: BroadcastRow[] }>('/client-broadcasts'),
  })

  const send = useMutation({
    mutationFn: () => api.post<{ id: string; recipients: number }>('/client-broadcasts', {
      ...target, title: title.trim(), body: body.trim(), channels: { push, telegram },
    }),
    onSuccess: (r) => {
      setConfirm(false)
      setTitle(''); setBody('')
      show(`Рассылка отправлена: ${r.recipients} ${plural(r.recipients, 'клиент', 'клиента', 'клиентов')}`)
      qc.invalidateQueries({ queryKey: ['broadcasts'] })
      // Счётчики доставки дописываются в фоне — перечитаем чуть позже.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['broadcasts'] }), 4000)
    },
    onError: (e: Error) => { setConfirm(false); show(e.message || 'Не удалось отправить', 'error') },
  })

  const canSend = title.trim().length > 0 && body.trim().length > 0 && (stats?.recipients ?? 0) > 0
  const recipients = stats?.recipients ?? 0

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Рассылки" subtitle="Уведомления клиентам в приложении Titan Resident" onBack={() => router.push('/manage')} />
      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <section className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LBL}>Кому</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AUDIENCES.map(a => (
                <Chip key={a.key} active={audience === a.key} onClick={() => setAudience(a.key)} icon={a.icon} size="sm">{a.label}</Chip>
              ))}
            </div>
            {audience === 'tier' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {tiers.map(t => (
                  <Chip key={t.key} active={tier === t.key} onClick={() => setTier(t.key)} activeColor={t.color} size="sm">{t.label}</Chip>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '10px 2px 0' }}>
              {stats
                ? <>Получат <b style={{ color: 'var(--on-surface)' }}>{recipients}</b> {plural(recipients, 'клиент', 'клиента', 'клиентов')} · с приложением {stats.withApp} · в Telegram {stats.withTelegram}</>
                : 'Считаем получателей…'}
            </p>
          </div>

          <div>
            <label style={LBL}>Заголовок</label>
            <input style={INP} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="Например: Турнир в субботу" />
          </div>
          <div>
            <label style={LBL}>Текст</label>
            <textarea style={{ ...INP, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} value={body} maxLength={1000}
              onChange={e => setBody(e.target.value)} placeholder="Что хотите сообщить клиентам" />
            <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 2px 0', textAlign: 'right' }}>{body.length}/1000</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToggleRow label="Push на телефон" subtitle="Всплывёт у тех, кто установил приложение и не отключил новости" value={push} onChange={setPush} />
            <ToggleRow label="Дублировать в Telegram" subtitle="Сообщение от бота кошелька тем, у кого привязан Telegram" value={telegram} onChange={setTelegram} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
            В ленте уведомлений приложения сообщение появится у всех получателей. Клиенты, отключившие новости клуба, рассылку не получат.
          </p>

          {/* Предпросмотр push */}
          {(title || body) && (
            <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13 }}>T</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Заголовок'}</span>
                  <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', flexShrink: 0 }}>сейчас</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '2px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{body || 'Текст сообщения'}</p>
              </div>
            </div>
          )}

          <Button icon="send" fullWidth disabled={!canSend} loading={send.isPending} onClick={() => setConfirm(true)}>
            Отправить
          </Button>
        </section>

        <section>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 4px 10px' }}>История</p>
          {history.isLoading ? <StateView state="loading" />
            : history.isError ? <StateView state="error" description="Не удалось загрузить историю." action={{ label: 'Повторить', onClick: () => history.refetch() }} />
            : (history.data?.broadcasts.length ?? 0) === 0 ? <StateView state="empty" icon="campaign" title="Рассылок пока не было" description="Отправленные сообщения появятся здесь." />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.data!.broadcasts.map(b => (
                  <div key={b.id} className="glass-l2" style={{ borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{b.title}</p>
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                        {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(b.createdAt))}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '6px 0 10px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{b.body}</p>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="group" size={14} />{audienceLabel(b.audience, tiers)} · {b.recipientsCount}</span>
                      {b.channels.push && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="notifications" size={14} />push {b.pushCount}</span>}
                      {b.channels.telegram && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="send" size={14} />Telegram {b.telegramCount}</span>}
                      {b.sentBy && <span>· {b.sentBy}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => send.mutate()}
        loading={send.isPending}
        title="Отправить рассылку?"
        message={`«${title.trim()}» получат ${recipients} ${plural(recipients, 'клиент', 'клиента', 'клиентов')}. Отменить отправку будет нельзя.`}
        confirmLabel="Отправить"
      />
    </div>
  )
}
