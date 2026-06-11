'use client'
/**
 * Корень «Управления».
 * Мобильный — меню разделов (как раньше). Десктоп (≥1024) — меню уже в левой
 * панели сплита (app/manage/layout.tsx), поэтому здесь пустое состояние.
 */
import { ManageMenu } from '@/components/manage/ManageMenu'
import { Icon } from '@/components/Icon'

export default function ManagePage() {
  return (
    <>
      <div className="manage-root-menu">
        <ManageMenu />
      </div>
      <div className="manage-root-placeholder">
        <div style={{ width: 72, height: 72, borderRadius: 22, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Icon name="dashboard_customize" size={34} color="#a78bfa" />
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: 'var(--on-surface)' }}>Выберите раздел</p>
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Он откроется здесь, рядом с меню</p>
      </div>
      <style>{`
        .manage-root-placeholder { display: none; }
        @media (min-width: 1024px) {
          .manage-root-menu { display: none; }
          .manage-root-placeholder {
            display: flex; flex: 1; min-height: 100%;
            flex-direction: column; align-items: center; justify-content: center;
            text-align: center; padding: 24px;
          }
        }
      `}</style>
    </>
  )
}
