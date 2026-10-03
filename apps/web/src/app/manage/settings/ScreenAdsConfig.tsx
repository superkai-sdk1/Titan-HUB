'use client'
/**
 * Блок «Titan Menu — реклама на экране» (вкладка «Заведение»).
 *
 * Слайды по очереди сменяют ленту «Игровой вечер / Кабинки» внизу экрана /menu —
 * панель переворачивается, меню над ней остаётся на месте. Слайд — картинка или
 * карточка (заголовок, текст и QR по ссылке, например на клиентское приложение).
 * API: /menu/slides (правит владелец), время ленты — app_settings.menu_screen_band_sec.
 *
 * Картинки сжимаются в браузере до 1920 px (JPEG): общий лимит тела запроса API —
 * 1 МБ, фото с телефона его превышают.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'
import { Sheet, Toggle, ConfirmDialog, Button, INP } from '@/components/manage/DesignSystem'

interface Slide {
  id: string
  kind: 'image' | 'card'
  imageUrl: string | null
  title: string | null
  body: string | null
  linkUrl: string | null
  durationSec: number
  isActive: boolean
  sortOrder: number
}
type Draft = { id?: string; kind: 'image' | 'card'; imageUrl: string | null; title: string; body: string; linkUrl: string; durationSec: number }

const SLIDES_KEY = ['screen-slides']
const BAND_KEY = ['settings', 'screen-band']
const DURATIONS = [5, 8, 10, 15, 20, 30]
const BAND_DURATIONS = [10, 15, 20, 30, 45, 60]

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const SEL: React.CSSProperties = { padding: '6px 8px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 12.5 }
const iconBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

// Сжатие картинки до 1920×1080 (JPEG): вписывается в лимит запроса и экономит трафик ТВ.
async function compressImage(file: File): Promise<Blob> {
  const src = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Не удалось прочитать картинку'))
      i.src = src
    })
    const scale = Math.min(1, 1920 / img.naturalWidth, 1080 / img.naturalHeight)
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Не удалось обработать картинку')
    ctx.fillStyle = '#0b0810' // прозрачный PNG — на фоне экрана, а не на чёрном
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    for (const q of [0.86, 0.76, 0.66]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
      if (blob && blob.size < 900 * 1024) return blob
    }
    throw new Error('Картинка слишком тяжёлая даже после сжатия')
  } finally {
    URL.revokeObjectURL(src)
  }
}

async function uploadImage(file: File): Promise<string> {
  const blob = await compressImage(file)
  const fd = new FormData()
  fd.append('file', blob, 'slide.jpg')
  const base = process.env.NEXT_PUBLIC_API_URL ?? '/api'
  const token = useAuthStore.getState().token
  const res = await fetch(`${base}/upload/image`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd })
  if (!res.ok) {
    const e = await res.json().catch(() => null)
    throw new Error(e?.error || 'Не удалось загрузить картинку')
  }
  return (await res.json()).url as string
}

function SlideThumb({ s }: { s: Pick<Slide, 'kind' | 'imageUrl' | 'title' | 'linkUrl'> }) {
  const box: React.CSSProperties = { width: 96, height: 34, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }
  if (s.kind === 'image' && s.imageUrl) {
    return <div style={box}><img src={s.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
  }
  return (
    <div style={{ ...box, background: '#8c52ff', display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px' }}>
      {s.linkUrl && <span style={{ width: 22, height: 22, borderRadius: 4, background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="qr_code_2" size={16} color="#111" /></span>}
      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', lineHeight: 1.1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title || 'Карточка'}</span>
    </div>
  )
}

export function ScreenAdsConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const user = useAuthStore((s) => s.user)
  const isOwner = (user?.role ?? 'staff') === 'owner'
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDel, setConfirmDel] = useState<Slide | null>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const { data } = useQuery({ queryKey: SLIDES_KEY, queryFn: () => api.get<{ slides: Slide[] }>('/menu/slides') })
  const slides = data?.slides ?? []
  const { data: bandSec } = useQuery({
    queryKey: BAND_KEY,
    queryFn: async () => {
      const r = await api.get<{ settings: Record<string, string> }>('/system/settings')
      return Number(r.settings?.menu_screen_band_sec) || 20
    },
  })

  const refresh = () => qc.invalidateQueries({ queryKey: SLIDES_KEY })
  const fail = (e: unknown) => show(e instanceof Error && e.message ? e.message : 'Не удалось сохранить', 'error')

  const create = useMutation({
    mutationFn: (b: Omit<Draft, 'id'>) => api.post('/menu/slides', {
      kind: b.kind, imageUrl: b.imageUrl, title: b.title.trim() || null, body: b.body.trim() || null,
      linkUrl: b.linkUrl.trim() || null, durationSec: b.durationSec,
    }),
    onSuccess: () => { refresh(); setDraft(null); show('Слайд добавлен — появится на экране в течение 20 секунд', 'success') },
    onError: fail,
  })
  const update = useMutation({
    mutationFn: ({ id, ...b }: Partial<Slide> & { id: string }) => api.patch(`/menu/slides/${id}`, b),
    onMutate: ({ id, ...b }) => {
      qc.setQueryData<{ slides: Slide[] }>(SLIDES_KEY, (old) => old ? { slides: old.slides.map((x) => (x.id === id ? { ...x, ...b } : x)) } : old)
    },
    onSuccess: () => setDraft(null),
    onError: (e) => { fail(e); refresh() },
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/slides/${id}`),
    onSuccess: () => { refresh(); setConfirmDel(null); setDraft(null) },
    onError: fail,
  })
  const reorder = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch('/menu/slides/reorder', { items }),
    onMutate: (items) => {
      const order = new Map(items.map((i) => [i.id, i.sortOrder]))
      qc.setQueryData<{ slides: Slide[] }>(SLIDES_KEY, (old) => old
        ? { slides: old.slides.map((x) => ({ ...x, sortOrder: order.get(x.id) ?? x.sortOrder })).sort((a, b) => a.sortOrder - b.sortOrder) }
        : old)
    },
    onError: (e) => { fail(e); refresh() },
  })
  const saveBand = useMutation({
    mutationFn: (sec: number) => api.patch('/system/settings', { menu_screen_band_sec: String(sec) }),
    onMutate: (sec) => qc.setQueryData(BAND_KEY, sec),
    onError: (e) => { fail(e); qc.invalidateQueries({ queryKey: BAND_KEY }) },
  })

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= slides.length) return
    const next = slides.slice()
    const [it] = next.splice(index, 1)
    next.splice(j, 0, it!)
    reorder.mutate(next.map((s, i) => ({ id: s.id, sortOrder: i })))
  }

  const pickImage = async (file: File | undefined, replaceId?: string) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      if (replaceId) {
        setDraft((d) => (d ? { ...d, imageUrl: url } : d))
      } else {
        create.mutate({ kind: 'image', imageUrl: url, title: '', body: '', linkUrl: '', durationSec: 10 })
      }
    } catch (e) {
      fail(e)
    } finally {
      setUploading(false)
    }
  }

  const addMyTitan = () => create.mutate({
    kind: 'card', imageUrl: null,
    title: 'My Titan — твой клуб в телефоне',
    body: 'Баланс, бонусы и запись на игры. Наведи камеру на QR',
    linkUrl: `${origin}/residents`, durationSec: 10,
  })

  const openEdit = (s: Slide) => setDraft({
    id: s.id, kind: s.kind, imageUrl: s.imageUrl, title: s.title ?? '', body: s.body ?? '', linkUrl: s.linkUrl ?? '', durationSec: s.durationSec,
  })

  const saveDraft = () => {
    if (!draft) return
    if (draft.kind === 'card' && !draft.title.trim() && !draft.body.trim() && !draft.linkUrl.trim()) { show('Заполните заголовок, текст или ссылку', 'error'); return }
    if (draft.id) {
      update.mutate({
        id: draft.id, imageUrl: draft.imageUrl, title: draft.title.trim() || null, body: draft.body.trim() || null,
        linkUrl: draft.linkUrl.trim() || null, durationSec: draft.durationSec,
      })
    } else {
      const { id: _omit, ...rest } = draft
      create.mutate(rest)
    }
  }

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(245,158,11,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="campaign" size={16} color="#F59E0B" />
        </div>
        <span style={{ ...LBL, color: '#F59E0B' }}>Titan Menu — реклама на экране</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
        Слайды по очереди сменяют ленту «Игровой вечер / Кабинки» внизу экрана: панель переворачивается, меню остаётся на месте.
        Картинка вписывается целиком — лучше всего широкая, примерно 3:1 (например 1500×500).
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 13.5 }}>Лента тарифов и кабинок на экране</span>
        <select style={SEL} value={bandSec ?? 20} disabled={!isOwner} onChange={(e) => saveBand.mutate(Number(e.target.value))}>
          {BAND_DURATIONS.map((s) => <option key={s} value={s}>{s} с</option>)}
        </select>
      </div>

      {slides.length === 0 ? (
        <div style={{ padding: '16px 14px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.14)', fontSize: 13, color: 'var(--on-surface-variant)', textAlign: 'center' }}>
          Слайдов пока нет — на экране только лента тарифов.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slides.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', opacity: s.isActive ? 1 : 0.55 }}>
              <SlideThumb s={s} />
              <button onClick={() => isOwner && openEdit(s)} disabled={!isOwner} style={{ flex: '1 1 140px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: isOwner ? 'pointer' : 'default' }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.kind === 'image' ? 'Картинка' : (s.title || 'Карточка')}</p>
                <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.kind === 'card' ? (s.linkUrl ? `QR → ${s.linkUrl.replace(/^https?:\/\//, '')}` : 'Карточка без QR') : 'Нажмите, чтобы заменить'}
                </p>
              </button>
              {/* Управление — справа; на узком экране уходит во вторую строку. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <select style={SEL} value={s.durationSec} disabled={!isOwner} onChange={(e) => update.mutate({ id: s.id, durationSec: Number(e.target.value) })} aria-label="Длительность показа">
                {(DURATIONS.includes(s.durationSec) ? DURATIONS : [...DURATIONS, s.durationSec].sort((a, b) => a - b)).map((d) => <option key={d} value={d}>{d} с</option>)}
              </select>
              {isOwner && (
                <>
                  <button style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше"><Icon name="arrow_circle_up" size={16} /></button>
                  <button style={{ ...iconBtn, opacity: i === slides.length - 1 ? 0.35 : 1 }} disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Ниже"><Icon name="arrow_circle_down" size={16} /></button>
                </>
              )}
              <Toggle size="sm" value={s.isActive} onChange={(v) => isOwner && update.mutate({ id: s.id, isActive: v })} ariaLabel="Показывать на экране" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwner ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant="secondary" icon="add" loading={uploading} onClick={() => fileRef.current?.click()}>Картинка</Button>
          <Button size="sm" variant="secondary" icon="description" onClick={() => setDraft({ kind: 'card', imageUrl: null, title: '', body: '', linkUrl: '', durationSec: 10 })}>Карточка с QR</Button>
          <Button size="sm" variant="secondary" icon="qr_code_2" loading={create.isPending && !draft} onClick={addMyTitan}>QR приложения My Titan</Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Рекламу на экране настраивает владелец.</p>
      )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.kind === 'image' ? 'Картинка' : draft?.id ? 'Карточка' : 'Новая карточка'} desktopSize="md">
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
            {draft.kind === 'image' ? (
              <>
                {draft.imageUrl && <img src={draft.imageUrl} alt="" style={{ width: '100%', aspectRatio: '3 / 1', objectFit: 'contain', background: '#0b0810', borderRadius: 12, display: 'block' }} />}
                <Button variant="secondary" icon="upload_file" loading={uploading} onClick={() => replaceRef.current?.click()}>Заменить картинку</Button>
                <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0], draft.id ?? 'new'); e.target.value = '' }} />
              </>
            ) : (
              <>
                <label style={LBL}>Заголовок</label>
                <input style={INP} value={draft.title} maxLength={80} placeholder="My Titan — твой клуб в телефоне" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <label style={LBL}>Текст</label>
                <textarea style={{ ...INP, minHeight: 72, resize: 'vertical' }} value={draft.body} maxLength={240} placeholder="Баланс, бонусы и запись на игры" onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <label style={LBL}>Ссылка для QR</label>
                <input style={INP} value={draft.linkUrl} placeholder="https://…" inputMode="url" onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} />
                <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '-6px 0 0' }}>QR рисуется автоматически. Без ссылки карточка будет только с текстом.</p>
              </>
            )}
            <label style={LBL}>Показывать</label>
            <select style={{ ...SEL, padding: '10px 12px', fontSize: 14 }} value={draft.durationSec} onChange={(e) => setDraft({ ...draft, durationSec: Number(e.target.value) })}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} секунд</option>)}
            </select>
            <Button fullWidth loading={create.isPending || update.isPending} onClick={saveDraft}>Сохранить</Button>
            {draft.id && (
              <Button fullWidth variant="danger" icon="delete" onClick={() => setConfirmDel(slides.find((x) => x.id === draft.id) ?? null)}>Удалить слайд</Button>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && remove.mutate(confirmDel.id)}
        title="Удалить слайд?"
        message="Он пропадёт с экрана ТВ в течение 20 секунд."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
