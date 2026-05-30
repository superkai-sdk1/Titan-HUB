'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { startRegistration } from '@simplewebauthn/browser'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { useAuthStore } from '@/store/auth.store'

interface PasskeyRecord {
  id: string
  deviceType: string | null
  backedUp: boolean | null
  createdAt: string | null
}

// Любой авторизованный сотрудник может сам завести/удалить СВОЙ passkey
// (эндпоинты /auth/passkey/* — self-service, по текущему токену). Раздел
// «Сотрудники» (управление чужими ключами) остаётся только у владельца.
export default function SecurityPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const user = useAuthStore(s => s.user)
  const [registering, setRegistering] = useState(false)

  const { data, isLoading } = useQuery<{ passkeys: PasskeyRecord[] }>({
    queryKey: ['my-passkeys'],
    queryFn: () => api.get('/auth/passkey/list'),
  })
  const passkeys = data?.passkeys ?? []

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/passkey/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-passkeys'] }); show('Passkey удалён', 'success') },
    onError: () => show('Не удалось удалить passkey', 'error'),
  })

  async function register() {
    setRegistering(true)
    try {
      const options = await api.post<any>('/auth/passkey/register/options', {})
      const response = await startRegistration({ optionsJSON: options })
      await api.post('/auth/passkey/register/verify', response)
      qc.invalidateQueries({ queryKey: ['my-passkeys'] })
      show('Passkey добавлен', 'success')
    } catch (e: any) {
      // Пользователь отменил системный диалог — молча выходим.
      if (e?.name === 'NotAllowedError') { setRegistering(false); return }
      show(e instanceof ApiError ? e.message : 'Ошибка регистрации passkey', 'error')
    } finally {
      setRegistering(false)
    }
  }

  function fmtDate(s: string | null): string {
    if (!s) return ''
    try { return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return '' }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Мой Passkey" subtitle="Вход по Face ID / Touch ID / ключу" />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Кто я */}
        <div className="glass-l2" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.18)', border: '2px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#A78BFA', flexShrink: 0 }}>
            {user?.nickname?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{user?.nickname ?? '—'}</p>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{(user?.role ?? 'staff') === 'owner' ? 'Владелец' : 'Персонал'}</p>
          </div>
        </div>

        {/* Добавить passkey */}
        <button onClick={register} disabled={registering}
          style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: registering ? 'default' : 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: registering ? 0.7 : 1 }}>
          <Icon name="fingerprint" size={20} />
          {registering ? 'Регистрация…' : 'Добавить Passkey'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '-6px 4px 0', lineHeight: 1.5 }}>
          После добавления вы сможете входить в систему по Face ID / Touch ID или ключу безопасности, без ПИН-кода.
        </p>

        {/* Список ключей */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '6px 4px 10px' }}>
            Мои ключи ({passkeys.length})
          </p>
          {isLoading && !data ? (
            <StateView state="loading" />
          ) : passkeys.length === 0 ? (
            <StateView state="empty" icon="fingerprint" title="Пока нет ни одного passkey" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {passkeys.map(pk => (
                <div key={pk.id} className="glass-l2" style={{ borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="fingerprint" size={18} color="#A78BFA" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>
                      {pk.deviceType === 'singleDevice' ? 'Это устройство' : pk.deviceType === 'multiDevice' ? 'Синхронизируемый ключ' : 'Passkey'}
                      {pk.backedUp ? ' · в облаке' : ''}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Добавлен {fmtDate(pk.createdAt)}</p>
                  </div>
                  <button onClick={() => del.mutate(pk.id)} disabled={del.isPending} aria-label="Удалить passkey"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', cursor: 'pointer' }}>
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
