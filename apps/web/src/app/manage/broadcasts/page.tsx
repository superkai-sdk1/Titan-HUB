'use client'
/**
 * «Рассылки» — сообщения клиентам клуба: лента и push в приложении Titan Resident,
 * по желанию — дубль от бота кошелька в Telegram. Массовые рассылки — владельцу.
 * Аудитория: все / по статусу / должники / с депозитом / выбранные вручную /
 * по последнему опросу чата в Telegram (кто выбрал нужные варианты или не голосовал).
 */
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Button, ConfirmDialog, INP, LBL, ToggleRow, Chip } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

type Audience = 'all' | 'tier' | 'debtors' | 'depositors' | 'profiles' | 'poll'
interface TierRow { key: string; label: string; color: string }
interface RecipientRow {
  id: string; nickname: string; fullName: string | null; photoUrl: string | null
  clientTier: string; hasApp: boolean; hasTelegram: boolean
}
interface PollRow {
  chatId: string; title: string; postedAt: string; totalVotes: number
  options: { index: number; label: string; votes: number; clients: number }[]
  notVoted: { people: number; clients: number }
}
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
  { key: 'profiles', label: 'Выбранные', icon: 'checklist' },
  { key: 'poll', label: 'По опросу', icon: 'how_to_vote' },
]

function audienceLabel(a: string, tiers: TierRow[]): string {
  if (a.startsWith('tier:')) return tiers.find(t => t.key === a.slice(5))?.label ?? 'Статус'
  if (a.startsWith('poll:')) return `Опрос: ${a.slice(5)}`
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
  const [picked, setPicked] = useState<string[]>([])
  const [poll, setPoll] = useState<{ chatId: string; options: number[]; notVoted: boolean } | null>(null)

  const { data: tiersData } = useQuery({ queryKey: ['client-tiers'], queryFn: () => api.get<{ tiers: TierRow[] }>('/clients/tiers') })
  const tiers = tiersData?.tiers ?? []
  const pollReady = !!poll && (poll.options.length > 0 || poll.notVoted)
  const target = {
    audience,
    ...(audience === 'tier' ? { tier } : {}),
    ...(audience === 'profiles' ? { profileIds: picked } : {}),
    ...(audience === 'poll' && poll ? { poll } : {}),
  }
  // Пустой ручной выбор / опрос без отмеченных вариантов — считать нечего.
  const targetEmpty = (audience === 'profiles' && picked.length === 0) || (audience === 'poll' && !pollReady)

  const { data: stats } = useQuery({
    queryKey: ['broadcast-audience', audience, tier, picked, poll],
    queryFn: () => api.post<AudienceStats>('/client-broadcasts/audience', target),
    enabled: !targetEmpty,
    placeholderData: (prev) => prev,
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

  const recipients = targetEmpty ? 0 : (stats?.recipients ?? 0)
  const canSend = title.trim().length > 0 && body.trim().length > 0 && recipients > 0

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
            {audience === 'profiles' && <RecipientPicker picked={picked} onChange={setPicked} />}
            {audience === 'poll' && <PollPicker value={poll} onChange={setPoll} />}
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '10px 2px 0' }}>
              {targetEmpty
                ? (audience === 'profiles' ? 'Отметьте получателей в списке' : 'Выберите опрос и варианты ответа')
                : stats
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

const LIST_BOX: React.CSSProperties = {
  marginTop: 10, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)', maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain',
}

function Badge({ icon, on, title }: { icon: string; on: boolean; title: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', opacity: on ? 1 : 0.25, color: on ? 'var(--primary-violet-light, #a78bfa)' : 'var(--on-surface-variant)' }}>
      <Icon name={icon} size={16} />
    </span>
  )
}

/** Ручной выбор получателей: поиск по нику/имени, отметки, быстрые фильтры. */
function RecipientPicker({ picked, onChange }: { picked: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [onlyApp, setOnlyApp] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['broadcast-recipients'],
    queryFn: () => api.get<{ clients: RecipientRow[] }>('/client-broadcasts/recipients'),
  })
  const all = data?.clients ?? []
  const set = useMemo(() => new Set(picked), [picked])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(c => (!onlyApp || c.hasApp)
      && (!needle || c.nickname.toLowerCase().includes(needle) || (c.fullName ?? '').toLowerCase().includes(needle)))
  }, [all, q, onlyApp])
  const toggle = (id: string) => onChange(set.has(id) ? picked.filter(x => x !== id) : [...picked, id])
  const allShownPicked = shown.length > 0 && shown.every(c => set.has(c.id))
  const toggleShown = () => {
    if (allShownPicked) onChange(picked.filter(id => !shown.some(c => c.id === id)))
    else onChange([...new Set([...picked, ...shown.map(c => c.id)])])
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input style={INP} value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по нику или имени" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <Chip size="sm" icon="smartphone" active={onlyApp} onClick={() => setOnlyApp(v => !v)}>С приложением</Chip>
        <Chip size="sm" icon="done_all" active={false} onClick={toggleShown}>
          {allShownPicked ? 'Снять видимых' : 'Отметить видимых'}
        </Chip>
        {picked.length > 0 && <Chip size="sm" icon="close" active={false} onClick={() => onChange([])}>Сбросить ({picked.length})</Chip>}
      </div>
      <div style={LIST_BOX}>
        {isLoading ? <div style={{ padding: 16 }}><StateView state="loading" /></div>
          : isError ? <div style={{ padding: 16 }}><StateView state="error" description="Не удалось загрузить клиентов." action={{ label: 'Повторить', onClick: () => refetch() }} /></div>
          : shown.length === 0 ? <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--on-surface-variant)' }}>Никого не нашли</p>
          : shown.map((c, i) => {
            const on = set.has(c.id)
            return (
              <button key={c.id} onClick={() => toggle(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', textAlign: 'left',
                background: on ? 'rgba(139,92,246,0.12)' : 'transparent', border: 'none', cursor: 'pointer',
                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)', color: 'var(--on-surface)',
              }}>
                <Icon name={on ? 'check_circle' : 'radio_button_unchecked'} size={20} style={{ color: on ? 'var(--primary-violet)' : 'var(--on-surface-variant)', flexShrink: 0 }} />
                {c.photoUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.photoUrl} alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{c.nickname.slice(0, 1).toUpperCase()}</span>}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nickname}</span>
                  {c.fullName && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fullName}</span>}
                </span>
                <Badge icon="smartphone" on={c.hasApp} title={c.hasApp ? 'Установлено приложение' : 'Приложения нет'} />
                <Badge icon="send" on={c.hasTelegram} title={c.hasTelegram ? 'Привязан Telegram' : 'Telegram не привязан'} />
              </button>
            )
          })}
      </div>
    </div>
  )
}

/** Выбор последнего опроса чата и вариантов ответа (голос ↔ клиент по привязанному Telegram). */
function PollPicker({ value, onChange }: {
  value: { chatId: string; options: number[]; notVoted: boolean } | null
  onChange: (v: { chatId: string; options: number[]; notVoted: boolean } | null) => void
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['broadcast-polls'],
    queryFn: () => api.get<{ polls: PollRow[] }>('/client-broadcasts/polls'),
  })
  const polls = data?.polls ?? []
  const current = polls.find(p => p.chatId === value?.chatId) ?? null
  const fmt = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  if (isLoading) return <div style={{ marginTop: 12 }}><StateView state="loading" /></div>
  if (isError) return <div style={{ marginTop: 12 }}><StateView state="error" description="Не удалось загрузить опросы." action={{ label: 'Повторить', onClick: () => refetch() }} /></div>
  if (polls.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '12px 2px 0', lineHeight: 1.5 }}>
      Опросов пока нет. Они появятся здесь после того, как бот выложит опрос в чат («Управление» → «Опросы»).
    </p>
  }

  const toggleOption = (i: number) => {
    if (!value) return
    const has = value.options.includes(i)
    onChange({ ...value, options: has ? value.options.filter(x => x !== i) : [...value.options, i] })
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {polls.map(p => {
          const on = p.chatId === value?.chatId
          return (
            <button key={p.chatId} onClick={() => onChange(on ? null : { chatId: p.chatId, options: [], notVoted: false })} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
              background: on ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.04)',
              border: on ? '1px solid rgba(139,92,246,0.55)' : '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)',
            }}>
              <Icon name="how_to_vote" size={20} style={{ color: on ? 'var(--primary-violet)' : 'var(--on-surface-variant)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{p.title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
                  {fmt(p.postedAt)} · {p.totalVotes} {plural(p.totalVotes, 'голос', 'голоса', 'голосов')}
                </span>
              </span>
              <Icon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={20} style={{ color: on ? 'var(--primary-violet)' : 'var(--on-surface-variant)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
      {current && value && (
        <div>
          <label style={{ ...LBL, marginTop: 4 }}>Кто ответил</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {current.options.map(o => (
              <Chip key={o.index} size="sm" active={value.options.includes(o.index)} onClick={() => toggleOption(o.index)}>
                {o.label} · {o.clients}{o.votes !== o.clients ? ` из ${o.votes}` : ''}
              </Chip>
            ))}
            <Chip size="sm" icon="person_off" active={value.notVoted} onClick={() => onChange({ ...value, notVoted: !value.notVoted })}>
              Не голосовали · {current.notVoted.clients}
            </Chip>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '8px 2px 0', lineHeight: 1.5 }}>
            Число — клиенты с привязанным Telegram («из N» — всего голосов). «Не голосовали» — участники чата, которых видел бот, но без голоса в этом опросе.
          </p>
        </div>
      )}
    </div>
  )
}
