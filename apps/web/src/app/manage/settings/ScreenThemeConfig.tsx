'use client'
/**
 * Блок «Titan Menu — меню на экране ТВ» (вкладка «Заведение»): ссылка на /menu для AbleSign и
 * выбор темы оформления экрана. Тема хранится в app_settings.menu_screen_theme и
 * уходит на экран вместе с публичным меню — ТВ переключается сам (≤20 с), ссылку
 * в плеере менять не нужно. Миниатюры — public/tv-themes/<тема>.jpg.
 *
 * Свой ключ кэша: общий ['settings'] при обновлении сбросил бы несохранённую форму
 * «Заведение» (страница пересобирает форму из него).
 */
import React, { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'

const THEMES: { key: string; name: string; note: string }[] = [
  { key: 'night', name: 'Ночь', note: 'Фирменная: тёмная, фиолетовая лента' },
  { key: 'neon', name: 'Неон', note: 'Вывеска на кирпичной стене' },
  { key: 'deco', name: 'Ар-деко', note: 'Чикаго 20-х: чёрный и золото' },
  { key: 'synth', name: 'Синтвейв', note: 'Закат 80-х, бегущая сетка' },
  { key: 'avant', name: 'Конструктивизм', note: 'Плакат: бумага и гротеск' },
  { key: 'dossier', name: 'Досье', note: 'Дело мафии: машинка, штамп' },
  { key: 'halloween', name: 'Хеллоуин', note: 'Тыквы, летучие мыши, паутина' },
]
const SETTING = 'menu_screen_theme'

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

export function ScreenThemeConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const user = useAuthStore((s) => s.user)
  const isOwner = (user?.role ?? 'staff') === 'owner'
  const [url, setUrl] = useState('')
  useEffect(() => { setUrl(`${window.location.origin}/menu`) }, [])

  const { data } = useQuery<string>({
    queryKey: ['settings', 'screen-theme'],
    queryFn: async () => {
      const r = await api.get<{ settings: Record<string, string> }>('/system/settings')
      return r.settings?.[SETTING] || 'night'
    },
  })
  const current = data ?? 'night'

  const choose = useMutation({
    mutationFn: (key: string) => api.patch('/system/settings', { [SETTING]: key }),
    onMutate: (key) => {
      const prev = qc.getQueryData<string>(['settings', 'screen-theme'])
      qc.setQueryData(['settings', 'screen-theme'], key)
      return { prev }
    },
    onSuccess: (_d, key) => show(`Тема «${THEMES.find((t) => t.key === key)?.name ?? key}» — ТВ переключится в течение 20 секунд`, 'success'),
    onError: (_e, _key, ctx) => {
      qc.setQueryData(['settings', 'screen-theme'], ctx?.prev)
      show('Не удалось сменить тему экрана', 'error')
    },
  })

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); show('Ссылка скопирована', 'success') } catch { /* ссылка видна в строке */ }
  }

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="tv" size={16} color="#a78bfa" />
        </div>
        <span style={{ ...LBL, color: '#a78bfa' }}>Titan Menu — меню на экране ТВ</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '')}</p>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Ссылка для AbleSign. Состав экрана — кнопкой-телевизором на позициях в «Меню».</p>
        </div>
        <button onClick={copy} aria-label="Скопировать ссылку" style={iconBtn}><Icon name="content_copy" size={16} /></button>
        <a href="/menu" target="_blank" rel="noopener" aria-label="Открыть экран" style={{ ...iconBtn, textDecoration: 'none' }}><Icon name="open_in_new" size={16} /></a>
      </div>

      <div>
        <span style={LBL}>Тема экрана</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 12, marginTop: 10 }}>
          {THEMES.map((t) => {
            const active = current === t.key
            return (
              <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => { if (isOwner && !active) choose.mutate(t.key) }}
                    disabled={!isOwner}
                    aria-pressed={active}
                    aria-label={`Тема «${t.name}»`}
                    style={{
                      position: 'relative', display: 'block', width: '100%', padding: 0, borderRadius: 14, overflow: 'hidden', cursor: isOwner ? 'pointer' : 'default',
                      border: active ? '2px solid #a78bfa' : '2px solid rgba(255,255,255,0.08)',
                      boxShadow: active ? '0 6px 22px rgba(139,92,246,0.35)' : 'none',
                      background: '#0f0b17', aspectRatio: '9 / 16', transition: 'border-color .15s, box-shadow .15s',
                    }}
                  >
                    <img src={`/tv-themes/${t.key}.jpg`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {active && (
                      <span style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                        <Icon name="check" size={15} color="#fff" />
                      </span>
                    )}
                  </button>
                  {/* Предпросмотр темы на весь экран — не выбирая её. */}
                  <a
                    href={`/menu?theme=${t.key}`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Предпросмотр «${t.name}»`}
                    title="Предпросмотр"
                    style={{ position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 9, background: 'rgba(15,11,23,0.78)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="open_in_new" size={14} />
                  </a>
                </div>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: active ? '#c4b5fd' : 'var(--on-surface)', overflowWrap: 'anywhere' }}>{t.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '1px 0 0', lineHeight: 1.3 }}>{t.note}</p>
                </div>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '12px 0 0', lineHeight: 1.5 }}>
          {isOwner
            ? 'Выбор сохраняется сразу: экран сам переключится в течение 20 секунд, ссылку в плеере менять не нужно.'
            : 'Тему экрана меняет владелец.'}
        </p>
      </div>
    </div>
  )
}
