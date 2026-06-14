'use client'
/**
 * Вкладка «Интеграции» — безопасное управление токенами/ключами.
 *
 * Анти-случайность (прямое требование владельца):
 * • Секреты read-only по умолчанию — видно только статус + masked-значение из API.
 * • Сам секрет НИКОГДА не возвращается и не показывается.
 * • Изменение — только через явную «Заменить» → модалку с предупреждением.
 *   Поле ввода нового значения отдельное, не префиллится; маскированное (password).
 *   Пустое значение не отправляется (кнопка «Сохранить» disabled) — нельзя затереть.
 * • Удаление — отдельное danger-подтверждение (ConfirmDialog).
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { INP, LBL, Button, Sheet, ConfirmDialog } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface IntegrationItem {
  key: string
  label: string
  configured: boolean
  masked: string | null
}

export function IntegrationsTab() {
  const qc = useQueryClient()
  const { show } = useToast()

  // Модалка замены: какой ключ редактируется + значение в отдельном поле.
  const [editing, setEditing] = useState<IntegrationItem | null>(null)
  const [value, setValue] = useState('')
  // Подтверждение удаления — отдельный ключ.
  const [deleting, setDeleting] = useState<IntegrationItem | null>(null)

  // Platega — два ключа (Merchant ID + секрет) в одном блоке/модалке.
  const [platOpen, setPlatOpen] = useState(false)
  const [platMerchant, setPlatMerchant] = useState('')
  const [platSecret, setPlatSecret] = useState('')
  const [platDeleting, setPlatDeleting] = useState(false)

  // GoMafia — логин владельца + (опц.) ссылка на клуб.
  const [gmOpen, setGmOpen] = useState(false)
  const [gmLogin, setGmLogin] = useState('')
  const [gmPassword, setGmPassword] = useState('')
  const [gmClubUrl, setGmClubUrl] = useState('')
  const [gmNeedClub, setGmNeedClub] = useState(false)
  const [gmDeleting, setGmDeleting] = useState(false)

  const { data, isLoading, error } = useQuery<{ items: IntegrationItem[] }>({
    queryKey: ['integrations'],
    queryFn: () => api.get('/system/integrations'),
  })

  const { data: gm } = useQuery<{ connected: boolean; source: string | null; clubId: string | null; clubTitle: string | null; loginMasked: string | null }>({
    queryKey: ['gomafia-status'],
    queryFn: () => api.get('/gomafia/status'),
  })

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.patch(`/system/integrations/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Ключ обновлён', 'success')
      closeEdit()
    },
    onError: () => show('Не удалось сохранить ключ', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (key: string) => api.delete(`/system/integrations/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Ключ удалён', 'success')
      setDeleting(null)
    },
    onError: () => show('Не удалось удалить ключ', 'error'),
  })

  // Platega: сохраняем оба ключа за один сабмит (пустое поле = «не менять»).
  const platSaveMut = useMutation({
    mutationFn: async ({ merchant, secret }: { merchant: string; secret: string }) => {
      if (merchant) await api.patch('/system/integrations/platega_merchant_id', { value: merchant })
      if (secret) await api.patch('/system/integrations/platega_secret', { value: secret })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Platega обновлена', 'success')
      closePlat()
    },
    onError: () => show('Не удалось сохранить Platega', 'error'),
  })

  // Удаление Platega = удаляем оба ключа.
  const platDeleteMut = useMutation({
    mutationFn: async () => {
      await api.delete('/system/integrations/platega_merchant_id')
      await api.delete('/system/integrations/platega_secret')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      show('Platega отключена', 'success')
      setPlatDeleting(false)
    },
    onError: () => show('Не удалось отключить Platega', 'error'),
  })

  function openEdit(item: IntegrationItem) {
    setEditing(item)
    setValue('') // отдельное поле, никогда не префиллится
  }
  function closeEdit() {
    setEditing(null)
    setValue('')
  }
  function openPlat() { setPlatOpen(true); setPlatMerchant(''); setPlatSecret('') }
  function closePlat() { setPlatOpen(false); setPlatMerchant(''); setPlatSecret('') }

  // GoMafia: вход (логин/пароль + опц. ссылка на клуб); при неопределённом клубе
  // оставляем модалку открытой и просим ссылку.
  const gmConnectMut = useMutation({
    mutationFn: (b: { login: string; password: string; clubUrl?: string }) => api.post<{ clubId: string | null; needClubUrl?: boolean }>('/gomafia/connect', b),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['gomafia-status'] })
      if (res?.clubId) { show('GoMafia подключена', 'success'); closeGm() }
      else { setGmNeedClub(true); show('Вход выполнен. Укажите ссылку на ваш клуб.', 'info') }
    },
    onError: (e: any) => show(e?.message || 'Не удалось подключить GoMafia', 'error'),
  })
  // Только задать/сменить клуб (без повторного ввода пароля).
  const gmClubMut = useMutation({
    mutationFn: (clubUrl: string) => api.post('/gomafia/club', { clubUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gomafia-status'] }); show('Клуб GoMafia сохранён', 'success'); closeGm() },
    onError: (e: any) => show(e?.message || 'Не удалось задать клуб', 'error'),
  })
  const gmDisconnectMut = useMutation({
    mutationFn: () => api.delete('/gomafia/disconnect'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gomafia-status'] }); show('GoMafia отключена', 'success'); setGmDeleting(false) },
    onError: () => show('Не удалось отключить GoMafia', 'error'),
  })
  function openGm() { setGmOpen(true); setGmLogin(''); setGmPassword(''); setGmClubUrl(''); setGmNeedClub(false) }
  function closeGm() { setGmOpen(false); setGmLogin(''); setGmPassword(''); setGmClubUrl(''); setGmNeedClub(false) }
  function submitGm() {
    const login = gmLogin.trim(), password = gmPassword.trim(), clubUrl = gmClubUrl.trim()
    if (login && password) gmConnectMut.mutate({ login, password, clubUrl: clubUrl || undefined })
    else if (clubUrl) gmClubMut.mutate(clubUrl)
  }

  if (isLoading && !data) return <StateView state="loading" />
  if (error) return <StateView state="error" description="Не удалось загрузить интеграции" />

  const items = data?.items ?? []
  const trimmed = value.trim()

  // Platega — два ключа объединены в один блок; из общего списка их убираем.
  const platMerchantItem = items.find(i => i.key === 'platega_merchant_id')
  const platSecretItem = items.find(i => i.key === 'platega_secret')
  const otherItems = items.filter(i => i.key !== 'platega_merchant_id' && i.key !== 'platega_secret')
  const platHasMerchant = !!platMerchantItem?.configured
  const platHasSecret = !!platSecretItem?.configured
  const platFull = platHasMerchant && platHasSecret
  const platPartial = (platHasMerchant || platHasSecret) && !platFull
  const platStatus = platFull
    ? `Подключено • ID ${platMerchantItem?.masked ?? '••••'} · ключ ${platSecretItem?.masked ?? '••••'}`
    : platPartial
      ? `Неполная настройка — ${platHasMerchant ? 'нет секретного ключа' : 'нет Merchant ID'}`
      : 'Не настроено'
  const platTrimmedM = platMerchant.trim()
  const platTrimmedS = platSecret.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
        Токены и ключи хранятся в зашифрованном виде. Показывается только маскированное
        значение — изменить можно лишь через явную замену.
      </p>

      {otherItems.map(item => (
        <div
          key={item.key}
          className="glass-l2"
          style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: item.configured ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${item.configured ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <Icon name={item.configured ? 'vpn_key' : 'key_off'} size={18} color={item.configured ? 'var(--success)' : 'var(--on-surface-variant)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>{item.label}</p>
              <p style={{
                fontSize: 12, margin: '3px 0 0',
                color: item.configured ? 'var(--success)' : 'var(--on-surface-variant)',
                fontFamily: item.configured ? "'JetBrains Mono',monospace" : undefined,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.configured ? `Подключено • ${item.masked ?? '••••'}` : 'Не настроено'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={item.configured ? 'edit' : 'add'}
              onClick={() => openEdit(item)}
              fullWidth
            >
              {item.configured ? 'Заменить' : 'Настроить'}
            </Button>
            {item.configured && (
              <Button
                variant="danger"
                size="sm"
                icon="delete"
                ariaLabel={`Удалить ${item.label}`}
                onClick={() => setDeleting(item)}
              >
                Удалить
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* Platega — Merchant ID + секретный ключ в одном блоке/модалке */}
      {(platMerchantItem || platSecretItem) && (
        <div
          className="glass-l2"
          style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: platFull ? 'rgba(52,211,153,0.12)' : platPartial ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${platFull ? 'rgba(52,211,153,0.28)' : platPartial ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <Icon name={platFull ? 'vpn_key' : platPartial ? 'warning' : 'key_off'} size={18} color={platFull ? 'var(--success)' : platPartial ? 'var(--warning)' : 'var(--on-surface-variant)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>Platega (СБП-эквайринг)</p>
              <p style={{
                fontSize: 12, margin: '3px 0 0',
                color: platFull ? 'var(--success)' : platPartial ? 'var(--warning)' : 'var(--on-surface-variant)',
                fontFamily: platFull ? "'JetBrains Mono',monospace" : undefined,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {platStatus}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={platFull ? 'edit' : 'add'}
              onClick={openPlat}
              fullWidth
            >
              {platFull ? 'Заменить' : platPartial ? 'Дополнить' : 'Настроить'}
            </Button>
            {(platHasMerchant || platHasSecret) && (
              <Button
                variant="danger"
                size="sm"
                icon="delete"
                ariaLabel="Удалить Platega"
                onClick={() => setPlatDeleting(true)}
              >
                Удалить
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Модалка Platega — оба ключа сразу */}
      <Sheet
        open={platOpen}
        onClose={closePlat}
        title={platFull ? 'Заменить ключи Platega' : 'Настроить Platega'}
        desktopSize="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex', gap: 10, padding: 14, borderRadius: 12,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
          }}>
            <Icon name="warning" size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface)', lineHeight: 1.5 }}>
              Merchant ID и секретный ключ из личного кабинета Platega. Хранятся в зашифрованном виде.
              {(platHasMerchant || platHasSecret) && <> Оставьте поле <b>пустым</b>, чтобы не менять текущее значение.</>}
            </p>
          </div>

          <div>
            <label style={LBL}>Merchant ID</label>
            <input
              type="text"
              autoComplete="off"
              autoFocus
              style={INP}
              value={platMerchant}
              onChange={e => setPlatMerchant(e.target.value)}
              placeholder={platHasMerchant ? `Сейчас: ${platMerchantItem?.masked ?? '••••'}` : 'Введите Merchant ID'}
            />
          </div>

          <div>
            <label style={LBL}>Секретный ключ</label>
            <input
              type="password"
              autoComplete="new-password"
              style={INP}
              value={platSecret}
              onChange={e => setPlatSecret(e.target.value)}
              placeholder={platHasSecret ? 'Задан — введите новый, чтобы заменить' : 'Введите секретный ключ'}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={closePlat} disabled={platSaveMut.isPending}>
              Отмена
            </Button>
            <Button
              variant="primary"
              fullWidth
              icon="save"
              loading={platSaveMut.isPending}
              // Хотя бы одно поле должно быть заполнено (пустое = не менять).
              disabled={!platTrimmedM && !platTrimmedS}
              onClick={() => platSaveMut.mutate({ merchant: platTrimmedM, secret: platTrimmedS })}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Подтверждение удаления Platega (оба ключа) */}
      <ConfirmDialog
        open={platDeleting}
        onClose={() => setPlatDeleting(false)}
        onConfirm={() => platDeleteMut.mutate()}
        title="Отключить Platega?"
        message="Merchant ID и секретный ключ будут удалены. Приём оплат через СБП перестанет работать, пока вы не настроите их заново."
        confirmLabel="Отключить"
        danger
        loading={platDeleteMut.isPending}
      />

      {/* GoMafia — подключение клуба (логин владельца) для подбора игроков */}
      <div
        className="glass-l2"
        style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: gm?.connected ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${gm?.connected ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            <Icon name={gm?.connected ? 'sports_esports' : 'sports_esports'} size={18} color={gm?.connected ? 'var(--success)' : 'var(--on-surface-variant)'} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>GoMafia.pro</p>
            <p style={{
              fontSize: 12, margin: '3px 0 0',
              color: gm?.connected ? 'var(--success)' : 'var(--on-surface-variant)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {gm?.connected
                ? `Подключено${gm.clubTitle ? ` • клуб «${gm.clubTitle}»` : gm.clubId ? ` • клуб #${gm.clubId}` : ' • клуб не указан'}${gm.source === 'project' ? ' • проектный аккаунт' : ''}`
                : 'Не настроено'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon={gm?.connected ? 'edit' : 'add'} onClick={openGm} fullWidth>
            {gm?.connected ? (gm.clubId ? 'Изменить' : 'Указать клуб') : 'Подключить'}
          </Button>
          {gm?.connected && (
            <Button variant="danger" size="sm" icon="delete" ariaLabel="Отключить GoMafia" onClick={() => setGmDeleting(true)}>
              Удалить
            </Button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
          Вход владельца клуба на gomafia.pro — чтобы при создании клиента подбирать игроков из состава вашего клуба и со всего сайта (ник, имя, фото подставляются автоматически).
        </p>
      </div>

      {/* Модалка GoMafia: логин + пароль + (опц.) ссылка на клуб */}
      <Sheet open={gmOpen} onClose={closeGm} title={gm?.connected ? 'GoMafia' : 'Подключить GoMafia'} desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex', gap: 10, padding: 14, borderRadius: 12,
            background: gmNeedClub ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${gmNeedClub ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            <Icon name={gmNeedClub ? 'warning' : 'info'} size={18} color={gmNeedClub ? 'var(--warning)' : 'var(--on-surface-variant)'} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface)', lineHeight: 1.5 }}>
              {gmNeedClub
                ? 'Вход выполнен, но клуб определить не удалось. Вставьте ссылку на ваш клуб (например, gomafia.pro/club/49).'
                : <>Логин и пароль владельца на gomafia.pro. Хранятся в зашифрованном виде, используются только для определения вашего клуба. {gm?.connected && <>Чтобы только сменить клуб — заполните лишь ссылку на клуб.</>}</>}
            </p>
          </div>

          {!gmNeedClub && (
            <>
              <div>
                <label style={LBL}>Логин на GoMafia</label>
                <input type="text" autoComplete="off" autoFocus style={INP} value={gmLogin}
                  onChange={e => setGmLogin(e.target.value)}
                  placeholder={gm?.loginMasked ? `Сейчас: ${gm.loginMasked}` : 'Ник или e-mail'} />
              </div>
              <div>
                <label style={LBL}>Пароль</label>
                <input type="password" autoComplete="new-password" style={INP} value={gmPassword}
                  onChange={e => setGmPassword(e.target.value)}
                  placeholder={gm?.connected ? 'Введите, чтобы переподключить' : 'Пароль на GoMafia'} />
              </div>
            </>
          )}

          <div>
            <label style={LBL}>Ссылка на клуб {gmNeedClub ? '' : '(необязательно)'}</label>
            <input type="text" autoComplete="off" autoFocus={gmNeedClub} style={INP} value={gmClubUrl}
              onChange={e => setGmClubUrl(e.target.value)}
              placeholder="gomafia.pro/club/49" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={closeGm} disabled={gmConnectMut.isPending || gmClubMut.isPending}>
              Отмена
            </Button>
            <Button
              variant="primary"
              fullWidth
              icon="check_circle"
              loading={gmConnectMut.isPending || gmClubMut.isPending}
              disabled={!(gmLogin.trim() && gmPassword.trim()) && !gmClubUrl.trim()}
              onClick={submitGm}
            >
              {(gmLogin.trim() && gmPassword.trim()) ? 'Подключить' : 'Сохранить клуб'}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Подтверждение отключения GoMafia */}
      <ConfirmDialog
        open={gmDeleting}
        onClose={() => setGmDeleting(false)}
        onConfirm={() => gmDisconnectMut.mutate()}
        title="Отключить GoMafia?"
        message="Логин, пароль и привязка клуба будут удалены. Подбор игроков из вашего клуба перестанет работать (поиск по всем игрокам останется доступен)."
        confirmLabel="Отключить"
        danger
        loading={gmDisconnectMut.isPending}
      />

      {/* Модалка замены/настройки — с предупреждением и отдельным полем ввода */}
      <Sheet
        open={!!editing}
        onClose={closeEdit}
        title={editing?.configured ? 'Заменить ключ' : 'Настроить ключ'}
        desktopSize="sm"
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'flex', gap: 10, padding: 14, borderRadius: 12,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            }}>
              <Icon name="warning" size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, margin: 0, color: 'var(--on-surface)', lineHeight: 1.5 }}>
                {editing.configured
                  ? <>Текущее значение <b>{editing.label}</b> будет заменено. Старый ключ восстановить нельзя. Вставьте новое значение полностью.</>
                  : <>Введите значение <b>{editing.label}</b>. Оно сохранится в зашифрованном виде.</>}
              </p>
            </div>

            <div>
              <label style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'block',
              }}>
                Новое значение
              </label>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                style={INP}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Вставьте токен / ключ"
                onKeyDown={e => {
                  if (e.key === 'Enter' && trimmed && !saveMut.isPending) {
                    saveMut.mutate({ key: editing.key, value: trimmed })
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" fullWidth onClick={closeEdit} disabled={saveMut.isPending}>
                Отмена
              </Button>
              <Button
                variant="primary"
                fullWidth
                icon="save"
                loading={saveMut.isPending}
                // Пустое значение не сохраняется — нельзя случайно затереть ключ.
                disabled={!trimmed}
                onClick={() => saveMut.mutate({ key: editing.key, value: trimmed })}
              >
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Отдельное danger-подтверждение удаления */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutate(deleting.key)}
        title="Удалить ключ?"
        message={deleting ? `«${deleting.label}» будет удалён. Интеграция перестанет работать, пока вы не настроите ключ заново.` : undefined}
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
      />
    </div>
  )
}
