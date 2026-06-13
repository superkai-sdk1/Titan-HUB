'use client'
/**
 * Единый экран «Лояльность»: вкладки Скидки · Бонусы · Сертификаты.
 * Объединяет прежние три раздела (/discounts, /bonuses, /certificates) в один хаб.
 * Скидки и Бонусы доступны только владельцу; Сертификаты — владельцу и персоналу.
 */
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/manage/DesignSystem'
import { Icon } from '@/components/Icon'
import { useAuthStore } from '@/store/auth.store'
import { useClubContext } from '@/components/ClubGate'
import { DiscountsTab } from './tabs/DiscountsTab'
import { BonusesTab } from './tabs/BonusesTab'
import { CertificatesTab } from './tabs/CertificatesTab'

type Tab = 'discounts' | 'bonuses' | 'certificates'

// module — ключ club_modules: вкладка скрывается, если модуль выключен у клуба.
// Бонусы отдельного модуля не имеют (часть лояльности) — всегда доступны владельцу.
const TABS: { key: Tab; label: string; icon: string; module?: string }[] = [
  { key: 'discounts',    label: 'Скидки',       icon: 'percent',       module: 'discounts' },
  { key: 'bonuses',      label: 'Бонусы',       icon: 'star' },
  { key: 'certificates', label: 'Сертификаты',  icon: 'card_giftcard', module: 'certificates' },
]

function isTab(v: string | null): v is Tab { return v === 'discounts' || v === 'bonuses' || v === 'certificates' }

export default function LoyaltyPage() {
  const router = useRouter()
  const role = useAuthStore(s => s.user?.role)
  const isOwner = role === 'owner'
  const { moduleEnabled } = useClubContext()
  // Видимые вкладки = не выключенные у клуба модули (fail-open: на осн. домене всё видно).
  const visibleTabs = TABS.filter(t => !t.module || moduleEnabled(t.module))
  const [tab, setTab] = useState<Tab>(isOwner ? 'discounts' : 'certificates')
  // Активная вкладка с учётом скрытых: если выбранная скрыта (модуль выкл) — первая видимая.
  const effectiveTab: Tab = visibleTabs.some(t => t.key === tab) ? tab : (visibleTabs[0]?.key ?? 'bonuses')

  // Вкладка в URL (?tab=) — без next/navigation, чтобы не требовать Suspense.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (isTab(t)) {
      // Персонал видит только сертификаты.
      if (!isOwner && t !== 'certificates') return
      setTab(t)
    }
  }, [isOwner])
  function changeTab(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Лояльность" subtitle="Скидки · бонусы · сертификаты" onBack={() => router.push('/manage')} />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Переключатель вкладок (segmented) — только у владельца и если вкладок > 1 */}
        {isOwner && visibleTabs.length > 1 && (
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
            {visibleTabs.map(t => {
              const active = effectiveTab === t.key
              return (
                <button key={t.key} onClick={() => changeTab(t.key)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s', background: active ? 'var(--primary-violet)' : 'transparent', color: active ? '#fff' : 'var(--on-surface-variant)' }}>
                  <Icon name={t.icon} size={17} color={active ? '#fff' : 'var(--on-surface-variant)'} />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Содержимое вкладки (по effectiveTab — учитывает скрытые модулем вкладки) */}
        {isOwner && effectiveTab === 'discounts' && moduleEnabled('discounts') && <DiscountsTab />}
        {isOwner && effectiveTab === 'bonuses' && <BonusesTab />}
        {(!isOwner || effectiveTab === 'certificates') && moduleEnabled('certificates') && <CertificatesTab />}
      </div>
    </div>
  )
}
