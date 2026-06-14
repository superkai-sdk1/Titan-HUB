'use client'
/**
 * Экран «Опросы» — настройка регулярных Telegram-опросов клуба.
 *
 * Бот опросов — отдельная интеграция (poll_bot_token), управляется по образцу
 * вкладки «Интеграции»: маска + явная замена/удаление. Сами опросы хранятся
 * целиком как массив конфигов; бэк постит их по расписанию (дни + время МСК).
 */
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { Icon } from '@/components/Icon'
import {
  PageHeader, SectionGroup, FormField, INP, LBL, Toggle, Button, IconButton,
  Chip, ConfirmDialog, SaveButton, Sheet,
} from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface PollConfig {
  id: string
  kind: string
  enabled: boolean
  chatId: string
  threadId: number | null
  title: string
  subtitleDay: string
  subtitleTime: string
  options: string[]
  weekdays: number[] // 1=Пн..7=Вс — ДНИ ПОСТИНГА
  postTime: string // "HH:MM" МСК
  lastPostedAt?: string | null
}

interface PollsResponse {
  configs: PollConfig[]
  tokenConfigured: boolean
  tokenMasked: string | null
}

// ─── Константы ──────────────────────────────────────────────────────────────

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
]

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/
const DEFAULT_OPTIONS = ['Да', 'Нет', 'Думаю', 'Опоздаю']

// Стандартные опросы для префилла пустого списка.
function buildDefaults(): PollConfig[] {
  return [
    {
      id: crypto.randomUUID(), kind: 'sport', enabled: false,
      chatId: '-1001281350483', threadId: 127961,
      title: 'Спортивная мафия', subtitleDay: 'Пятница', subtitleTime: '20:00',
      options: [...DEFAULT_OPTIONS], weekdays: [], postTime: '10:00',
    },
    {
      id: crypto.randomUUID(), kind: 'city', enabled: false,
      chatId: '-1002018963369', threadId: 67316,
      title: 'Городская мафия', subtitleDay: '', subtitleTime: '',
      options: [...DEFAULT_OPTIONS], weekdays: [], postTime: '10:00',
    },
  ]
}

function emptyConfig(): PollConfig {
  return {
    id: crypto.randomUUID(), kind: 'custom', enabled: false,
    chatId: '', threadId: null,
    title: '', subtitleDay: '', subtitleTime: '',
    options: [...DEFAULT_OPTIONS], weekdays: [], postTime: '10:00',
  }
}

function fmtDateTime(s?: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

// ─── Экран ──────────────────────────────────────────────────────────────────

export default function PollsPage() {
  const router = useRouter()
  const { show } = useToast()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<PollConfig[]>([])
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [tokenMasked, setTokenMasked] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Удаление опроса (подтверждение).
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Тест: id опроса, который сейчас отправляется.
  const [testingId, setTestingId] = useState<string | null>(null)

  // Управление токеном бота.
  const [tokenSheetOpen, setTokenSheetOpen] = useState(false)
  const [tokenValue, setTokenValue] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenDeleting, setTokenDeleting] = useState(false)
  const [confirmTokenDelete, setConfirmTokenDelete] = useState(false)

  // ── Загрузка ───────────────────────────────────────────────────────────────
  async function load() {
    setLoadError(null)
    try {
      const res = await api.get<PollsResponse>('/system/polls')
      // Если список пуст — предзаполняем стандартными опросами (это лишь форма,
      // сохранится при «Сохранить»).
      setConfigs(res.configs.length > 0 ? res.configs : buildDefaults())
      setTokenConfigured(res.tokenConfigured)
      setTokenMasked(res.tokenMasked)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить опросы')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Обновление одного конфига ────────────────────────────────────────────────
  function patchConfig(id: string, patch: Partial<PollConfig>) {
    setConfigs(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))
    setSaved(false)
  }

  function addConfig() {
    setConfigs(prev => [...prev, emptyConfig()])
    setSaved(false)
  }

  function removeConfig(id: string) {
    setConfigs(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
    setSaved(false)
  }

  // ── Валидация ────────────────────────────────────────────────────────────────
  function validate(): string | null {
    for (const c of configs) {
      const name = c.title.trim() || 'опрос без названия'
      if (!c.title.trim()) return 'У всех опросов должен быть заголовок'
      if (!c.chatId.trim()) return `«${name}»: укажите ID группы`
      const opts = c.options.map(o => o.trim()).filter(Boolean)
      if (opts.length < 2) return `«${name}»: нужно минимум 2 варианта ответа`
      if (!TIME_RE.test(c.postTime.trim())) return `«${name}»: время постинга в формате ЧЧ:ММ`
    }
    return null
  }

  // Нормализуем конфиги перед отправкой (чистим пустые варианты).
  function normalized(): PollConfig[] {
    return configs.map(c => ({
      ...c,
      title: c.title.trim(),
      chatId: c.chatId.trim(),
      postTime: c.postTime.trim(),
      options: c.options.map(o => o.trim()).filter(Boolean),
    }))
  }

  // ── Сохранение всех конфигов ─────────────────────────────────────────────────
  async function saveAll(): Promise<boolean> {
    const err = validate()
    if (err) { show(err, 'error'); return false }
    setSaving(true)
    try {
      const res = await api.put<{ ok: boolean; configs: PollConfig[] }>('/system/polls', { configs: normalized() })
      // Бэк мерджит lastPostedAt — берём свежие конфиги из ответа.
      if (res.configs) setConfigs(res.configs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      return true
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Не удалось сохранить', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function onSave() {
    const ok = await saveAll()
    if (ok) show('Сохранено', 'success')
  }

  // ── Тест: сначала сохраняем (опрос должен быть на бэке), затем отправляем ─────
  async function onTest(id: string) {
    if (!tokenConfigured) { show('Сначала настройте токен бота опросов', 'error'); return }
    setTestingId(id)
    try {
      const ok = await saveAll()
      if (!ok) return
      await api.post<{ ok: boolean; messageId: number }>('/system/polls/test', { id })
      show('Опрос отправлен', 'success')
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Бот не в группе или нет прав', 'error')
    } finally {
      setTestingId(null)
    }
  }

  // ── Токен бота ───────────────────────────────────────────────────────────────
  async function saveToken() {
    const v = tokenValue.trim()
    if (!v) return
    setTokenSaving(true)
    try {
      await api.patch('/system/integrations/poll_bot_token', { value: v })
      show('Токен сохранён', 'success')
      setTokenSheetOpen(false)
      setTokenValue('')
      await load()
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Не удалось сохранить токен', 'error')
    } finally {
      setTokenSaving(false)
    }
  }

  async function deleteToken() {
    setTokenDeleting(true)
    try {
      await api.delete('/system/integrations/poll_bot_token')
      show('Токен удалён', 'success')
      setConfirmTokenDelete(false)
      await load()
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Не удалось удалить токен', 'error')
    } finally {
      setTokenDeleting(false)
    }
  }

  // ── Загрузка / ошибка ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader title="Опросы" subtitle="Регулярные опросы в Telegram" onBack={() => router.push('/manage')} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader title="Опросы" subtitle="Регулярные опросы в Telegram" onBack={() => router.push('/manage')} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <Icon name="cancel" size={32} color="var(--danger)" />
          <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', textAlign: 'center', margin: 0 }}>{loadError}</p>
          <Button variant="secondary" icon="refresh" onClick={() => { setLoading(true); load() }}>Повторить</Button>
        </div>
      </div>
    )
  }

  const tokenTrimmed = tokenValue.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="Опросы" subtitle="Регулярные опросы в Telegram" onBack={() => router.push('/manage')} />

      <div style={{
        padding: '20px 16px var(--bottom-nav-clear, 24px)',
        maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>

        {/* ─── Бот опросов ──────────────────────────────────────────────── */}
        <SectionGroup title="Бот опросов">
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
              Бот должен быть <b>администратором</b> в группах, иначе опросы не отправятся.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tokenConfigured ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${tokenConfigured ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                <Icon name="campaign" size={18} color={tokenConfigured ? 'var(--success)' : 'var(--on-surface-variant)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>Токен бота</p>
                <p style={{
                  fontSize: 12, margin: '3px 0 0',
                  color: tokenConfigured ? 'var(--success)' : 'var(--on-surface-variant)',
                  fontFamily: tokenConfigured ? "'JetBrains Mono',monospace" : undefined,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tokenConfigured ? `Подключено • ${tokenMasked ?? '••••'}` : 'Не настроен'}
                </p>
              </div>
            </div>

            {tokenConfigured ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" icon="edit" fullWidth
                  onClick={() => { setTokenValue(''); setTokenSheetOpen(true) }}>
                  Заменить
                </Button>
                <Button variant="danger" size="sm" icon="delete" ariaLabel="Удалить токен"
                  onClick={() => setConfirmTokenDelete(true)}>
                  Удалить
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="password"
                  autoComplete="new-password"
                  style={INP}
                  value={tokenValue}
                  onChange={e => setTokenValue(e.target.value)}
                  placeholder="Токен бота (от @BotFather)"
                  onKeyDown={e => { if (e.key === 'Enter' && tokenTrimmed && !tokenSaving) saveToken() }}
                />
                <Button variant="primary" icon="check_circle" fullWidth
                  loading={tokenSaving} disabled={!tokenTrimmed} onClick={saveToken}>
                  Сохранить токен
                </Button>
              </div>
            )}
          </div>
        </SectionGroup>

        {/* ─── Список опросов ────────────────────────────────────────────── */}
        {configs.map(c => {
          const isTesting = testingId === c.id
          return (
            <SectionGroup key={c.id} title={c.title.trim() || 'Новый опрос'}>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Шапка: заголовок + вкл + удалить */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <FormField label="Заголовок">
                      <input style={INP} value={c.title}
                        onChange={e => patchConfig(c.id, { title: e.target.value })}
                        placeholder="Например, Спортивная мафия" />
                    </FormField>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                    <span style={{ ...LBL, margin: 0 }}>Вкл</span>
                    <Toggle value={c.enabled} onChange={v => patchConfig(c.id, { enabled: v })} ariaLabel="Включён" />
                  </div>
                  <IconButton icon="delete" variant="danger" ariaLabel="Удалить опрос"
                    onClick={() => setDeletingId(c.id)} style={{ marginBottom: 1 }} />
                </div>

                {/* ID группы */}
                <FormField label="ID группы">
                  <input style={INP} value={c.chatId}
                    onChange={e => patchConfig(c.id, { chatId: e.target.value })}
                    placeholder="-100…" inputMode="numeric" />
                </FormField>

                {/* Топик */}
                <FormField label="Топик (message_thread_id)" hint="Опционально. Пусто — отправка в общий чат группы.">
                  <input style={INP} type="number" value={c.threadId ?? ''}
                    onChange={e => {
                      const raw = e.target.value.trim()
                      patchConfig(c.id, { threadId: raw === '' ? null : Number(raw) })
                    }}
                    placeholder="Напр. 127961" />
                </FormField>

                {/* Подзаголовки */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FormField label="Подзаголовок — день">
                    <input style={INP} value={c.subtitleDay}
                      onChange={e => patchConfig(c.id, { subtitleDay: e.target.value })}
                      placeholder="Пятница" />
                  </FormField>
                  <FormField label="Подзаголовок — время">
                    <input style={INP} value={c.subtitleTime}
                      onChange={e => patchConfig(c.id, { subtitleTime: e.target.value })}
                      placeholder="20:00" />
                  </FormField>
                </div>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '-8px 0 0', lineHeight: 1.45 }}>
                  Показывается в опросе под заголовком (статичный текст).
                </p>

                {/* Варианты ответов */}
                <div>
                  <label style={LBL}>Варианты ответов</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {c.options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input style={INP} value={opt}
                          onChange={e => {
                            const next = [...c.options]
                            next[i] = e.target.value
                            patchConfig(c.id, { options: next })
                          }}
                          placeholder={`Вариант ${i + 1}`} />
                        <IconButton icon="delete" variant="ghost" ariaLabel={`Удалить вариант ${i + 1}`}
                          disabled={c.options.length <= 2}
                          onClick={() => patchConfig(c.id, { options: c.options.filter((_, j) => j !== i) })} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Button variant="secondary" size="sm" icon="add"
                      disabled={c.options.length >= 10}
                      onClick={() => patchConfig(c.id, { options: [...c.options, ''] })}>
                      Добавить вариант
                    </Button>
                  </div>
                </div>

                {/* Дни постинга */}
                <div>
                  <label style={LBL}>Дни постинга</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {WEEKDAYS.map(d => {
                      const active = c.weekdays.includes(d.value)
                      return (
                        <Chip key={d.value} active={active}
                          onClick={() => {
                            const next = active
                              ? c.weekdays.filter(w => w !== d.value)
                              : [...c.weekdays, d.value].sort((a, b) => a - b)
                            patchConfig(c.id, { weekdays: next })
                          }}>
                          {d.label}
                        </Chip>
                      )
                    })}
                  </div>
                </div>

                {/* Время постинга */}
                <FormField label="Время постинга (МСК)" hint="Формат ЧЧ:ММ — когда отправлять в выбранные дни.">
                  <input style={INP} value={c.postTime}
                    onChange={e => patchConfig(c.id, { postTime: e.target.value })}
                    placeholder="10:00" inputMode="numeric" />
                </FormField>

                {/* Тест + последняя отправка */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button variant="secondary" icon="send" fullWidth
                    loading={isTesting} disabled={!tokenConfigured || testingId !== null}
                    onClick={() => onTest(c.id)}>
                    Отправить сейчас (тест)
                  </Button>
                  {c.lastPostedAt && (
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
                      Последняя отправка: {fmtDateTime(c.lastPostedAt)}
                    </p>
                  )}
                </div>
              </div>
            </SectionGroup>
          )
        })}

        {/* ─── Добавить опрос ─────────────────────────────────────────────── */}
        <Button variant="secondary" icon="add" fullWidth onClick={addConfig}>
          Добавить опрос
        </Button>

        {/* ─── Сохранить ──────────────────────────────────────────────────── */}
        <SaveButton onClick={onSave} isPending={saving} isSaved={saved} />
      </div>

      {/* ─── Sheet: замена токена ─────────────────────────────────────────── */}
      <Sheet open={tokenSheetOpen} onClose={() => setTokenSheetOpen(false)} title="Заменить токен" desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex', gap: 10, padding: 14, borderRadius: 12,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
          }}>
            <Icon name="warning" size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface)', lineHeight: 1.5 }}>
              Текущий токен будет заменён. Старое значение восстановить нельзя — вставьте новый токен полностью.
            </p>
          </div>
          <div>
            <label style={LBL}>Новый токен</label>
            <input type="password" autoComplete="new-password" autoFocus style={INP}
              value={tokenValue} onChange={e => setTokenValue(e.target.value)}
              placeholder="Вставьте токен бота"
              onKeyDown={e => { if (e.key === 'Enter' && tokenTrimmed && !tokenSaving) saveToken() }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={() => setTokenSheetOpen(false)} disabled={tokenSaving}>
              Отмена
            </Button>
            <Button variant="primary" fullWidth icon="check_circle" loading={tokenSaving}
              disabled={!tokenTrimmed} onClick={saveToken}>
              Сохранить
            </Button>
          </div>
        </div>
      </Sheet>

      {/* ─── Подтверждение удаления опроса ─────────────────────────────────── */}
      <ConfirmDialog
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && removeConfig(deletingId)}
        title="Удалить опрос?"
        message="Опрос будет удалён из списка. Изменение вступит в силу после сохранения."
        confirmLabel="Удалить"
        danger
      />

      {/* ─── Подтверждение удаления токена ─────────────────────────────────── */}
      <ConfirmDialog
        open={confirmTokenDelete}
        onClose={() => setConfirmTokenDelete(false)}
        onConfirm={deleteToken}
        title="Удалить токен бота?"
        message="Опросы перестанут отправляться, пока вы не настроите токен заново."
        confirmLabel="Удалить"
        danger
        loading={tokenDeleting}
      />
    </div>
  )
}
