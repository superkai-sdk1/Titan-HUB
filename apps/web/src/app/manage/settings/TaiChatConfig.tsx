'use client'
/**
 * Блок «Tai в чате» (вкладка «Поведение»).
 *
 * Дерзкие ответы Tai на сообщения в Telegram-чате (через бота опросов). Стиль
 * собирается из: ПРЕСЕТ (1 из 5, общий) × ЖЁСТКОСТЬ × МАТ — последние два
 * настраиваются ПЕР-ГРУППУ. Tai шарит в мафии, держит контекст, отвечает коротко.
 * Рамки (без хейта/угроз/запрещёнки) — всегда. Нужен бот опросов + ИИ-ключ Tai.
 * Адресуется боту: «тай …» или реплаем на его ответ.
 */
import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

type Harshness = 'soft' | 'medium' | 'savage'
interface Preset { key: string; label: string; desc: string }
interface ChatCfg { id: number | string; title: string; type: string; enabled: boolean; profanity: boolean; harshness: Harshness }
interface Cfg { enabled: boolean; preset: string; presets: Preset[]; chats: ChatCfg[]; botReady: boolean; aiReady: boolean }

const HARSH: { key: Harshness; label: string }[] = [
  { key: 'soft', label: 'Мягко' },
  { key: 'medium', label: 'Средне' },
  { key: 'savage', label: 'Жёстко' },
]
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0' }

export function TaiChatConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const { data } = useQuery<Cfg>({ queryKey: ['tai-chat-config'], queryFn: () => api.get('/system/tai-chat-config') })
  // Локальное состояние пер-групповых настроек (чтобы менять без дёрганья сети на каждый клик).
  const [chats, setChats] = React.useState<ChatCfg[]>([])
  React.useEffect(() => { if (data?.chats) setChats(data.chats) }, [data?.chats])

  const save = useMutation({
    mutationFn: (patch: Partial<{ enabled: boolean; preset: string; chats: ChatCfg[] }>) => api.put('/system/tai-chat-config', patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tai-chat-config'] }); show('Сохранено', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })

  if (!data) return null
  const blocked = !data.botReady || !data.aiReady

  const patchChat = (id: ChatCfg['id'], patch: Partial<ChatCfg>) => {
    const next = chats.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch))
    setChats(next)
    save.mutate({ chats: next })
  }

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="auto_awesome" size={18} color="#a78bfa" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Tai в чате</p>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
        Tai отвечает в Telegram-чате как живой резидент клуба: коротко, в контексте беседы, шарит в мафии. Адресуйте ему: напишите «тай …» или ответьте реплаем на его сообщение.
      </p>

      <label style={{ ...toggleRow, opacity: blocked ? 0.5 : 1 }}>
        <span style={{ fontSize: 13.5 }}>Отвечать в чате <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— главный выключатель для всех групп</span></span>
        <input type="checkbox" checked={data.enabled} disabled={blocked || save.isPending} onChange={(e) => save.mutate({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#8B5CF6' }} />
      </label>

      {blocked && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <Icon name="info" size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            {!data.botReady && 'Подключите «Бот опросов» во вкладке «Интеграции». '}
            {!data.aiReady && 'Нужен ключ Tai (модуль «Tai — ИИ-ассистент»).'}
          </span>
        </div>
      )}

      {data.enabled && !blocked && (
        <>
          {/* Пресет стиля — общий для всех групп */}
          <p style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 6px' }}>Характер Tai</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {data.presets.map((p) => {
              const active = data.preset === p.key
              return (
                <button key={p.key} type="button" onClick={() => save.mutate({ preset: p.key })} disabled={save.isPending}
                  style={{
                    textAlign: 'left', padding: '9px 11px', borderRadius: 12, cursor: 'pointer',
                    border: active ? '1.5px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#c4b5fd' : 'var(--on-surface)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2, lineHeight: 1.4 }}>{p.desc}</div>
                </button>
              )
            })}
          </div>

          {/* Пер-групповые настройки: мат + жёсткость */}
          <p style={{ fontSize: 12, fontWeight: 700, margin: '14px 0 6px' }}>Настройки по группам</p>
          {chats.length === 0 ? (
            <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
              Группы появятся здесь, как только бот увидит сообщения в чате. Добавьте бота в группу и напишите что-нибудь.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chats.map((ch) => (
                <div key={String(ch.id)} style={{ borderRadius: 14, padding: '11px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title || `Чат ${ch.id}`}</span>
                    <input type="checkbox" checked={ch.enabled} disabled={save.isPending} onChange={(e) => patchChat(ch.id, { enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#8B5CF6', flexShrink: 0 }} />
                  </div>
                  {ch.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Мат</span>
                        <input type="checkbox" checked={ch.profanity} disabled={save.isPending} onChange={(e) => patchChat(ch.id, { profanity: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#8B5CF6', flexShrink: 0 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Жёсткость</span>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 9, padding: 3 }}>
                          {HARSH.map((h) => {
                            const active = ch.harshness === h.key
                            return (
                              <button key={h.key} type="button" disabled={save.isPending} onClick={() => patchChat(ch.id, { harshness: h.key })}
                                style={{
                                  padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                  background: active ? '#8B5CF6' : 'transparent',
                                  color: active ? '#fff' : 'var(--on-surface-variant)',
                                }}>{h.label}</button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Рамки соблюдаются всегда: без оскорблений по нац-ти/религии/полу/ориентации, без угроз и запрещёнки — только комедийные панчлайны.
          </p>
        </>
      )}
    </div>
  )
}
