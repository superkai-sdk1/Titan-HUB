'use client'
// ─── Панель клубов суперадмина (после входа) ──────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/manage/DesignSystem'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type { ClubListItem, ClubsResponse } from './types'
import {
  SaButton,
  SaPrimaryButton,
  SaBadge,
  SaSpinner,
  SaErrorBanner,
  subStatusView,
  clubStatusView,
  fmtDate,
} from './ui'
import { ClubDetail } from './ClubDetail'
import { CreateClubForm } from './CreateClubForm'

export function SuperadminPanel({
  onLogout,
  onUnauthorized,
}: {
  onLogout: () => void
  // Вызывается, если GET /clubs вернул 401 (токен протух) — родитель покажет вход.
  onUnauthorized: () => void
}) {
  const [clubs, setClubs] = useState<ClubListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await saApi.get<ClubsResponse>('/clubs')
      setClubs(res.clubs)
    } catch (e) {
      if (e instanceof SaApiError && e.status === 401) {
        onUnauthorized()
        return
      }
      setError(e instanceof SaApiError ? e.message : 'Не удалось загрузить список клубов')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse 90% 50% at 50% -10%, rgba(139,92,246,0.12) 0%, transparent 70%), #15121b',
        color: '#e8dfee',
      }}
    >
      {/* Шапка */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(21,18,27,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '16px 20px',
        }}
      >
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 24px rgba(139,92,246,0.35)',
            }}
          >
            <Icon name="store" size={20} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Суперадмин — Проекты</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Клубы платформы</p>
          </div>
          <SaButton variant="secondary" icon="logout" onClick={onLogout}>
            Выйти
          </SaButton>
        </div>
      </header>

      {/* Контент */}
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '20px 20px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            {clubs ? `Всего клубов: ${clubs.length}` : ''}
          </p>
          <SaPrimaryButton
            onClick={() => setCreateOpen(true)}
            icon="add"
            style={{ width: 'auto', padding: '11px 18px', fontSize: 14 }}
          >
            Создать клуб
          </SaPrimaryButton>
        </div>

        {loading && !clubs ? (
          <SaSpinner label="Загрузка клубов…" />
        ) : error && !clubs ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px' }}>
            <SaErrorBanner message={error} />
            <SaButton onClick={load} icon="error">
              Повторить
            </SaButton>
          </div>
        ) : clubs && clubs.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {clubs?.map((club) => (
              <ClubCard key={club.id} club={club} onClick={() => setDetailId(club.id)} />
            ))}
          </div>
        )}
      </main>

      {/* Sheet: создать клуб */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Новый клуб" desktopSize="sm" initialHeight="70dvh">
        <CreateClubForm
          onCreated={() => {
            setCreateOpen(false)
            load()
          }}
        />
      </Sheet>

      {/* Sheet: детали клуба */}
      <Sheet open={!!detailId} onClose={() => setDetailId(null)} title="Управление клубом" desktopSize="md" initialHeight="80dvh">
        {detailId && (
          <ClubDetail
            clubId={detailId}
            onChanged={load}
            onDeleted={() => {
              setDetailId(null)
              load()
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

// ─── Карточка клуба ────────────────────────────────────────────────────────────

function ClubCard({ club, onClick }: { club: ClubListItem; onClick: () => void }) {
  const sv = subStatusView(club.subStatus)
  const cs = clubStatusView(club.status)
  return (
    <button
      onClick={onClick}
      className="glass-l2"
      style={{
        textAlign: 'left',
        borderRadius: 18,
        padding: '16px 18px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: 'inherit',
        transition: 'border-color 0.2s, transform 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.985)'
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: 'rgba(139,92,246,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="store" size={20} color="#A78BFA" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              margin: 0,
              color: 'rgba(255,255,255,0.95)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {club.name}
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.4)',
              margin: '2px 0 0',
              fontFamily: "'JetBrains Mono',monospace",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {club.slug}
          </p>
        </div>
        <Icon name="chevron_right" size={18} color="rgba(255,255,255,0.3)" />
      </div>

      {club.subdomain && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <Icon name="link" size={14} color="rgba(255,255,255,0.35)" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.subdomain}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <SaBadge tone={cs.tone}>{cs.label}</SaBadge>
          <SaBadge tone={sv.tone}>{sv.label}</SaBadge>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>
        <Icon name="schedule" size={13} color="rgba(255,255,255,0.3)" />
        До {fmtDate(club.subPaidUntil)}
      </div>
    </button>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <Icon name="store" size={40} color="#a78bfa" />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Пока нет ни одного клуба</h3>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px', maxWidth: 320, lineHeight: 1.5 }}>
        Создайте первый клуб платформы — задайте slug, название и (опционально) поддомен.
      </p>
      <SaPrimaryButton onClick={onCreate} icon="add" style={{ width: 'auto', padding: '12px 22px' }}>
        Создать клуб
      </SaPrimaryButton>
    </div>
  )
}
