import type React from 'react'

// ─── Styles ──────────────────────────────────────────────────────────────────
// Вынесено из page.tsx (объект-литерал, статичный — не зависит от рендера).
// Денежный/визуальный стиль не меняем: «тихая роскошь», violet-акцент.
export const styles = {
  // Экраны loading/error/code (центрируем; собственный скролл при нужде).
  root: {
    height: '100dvh', overflowY: 'auto' as const, backgroundColor: '#15121b', display: 'flex', flexDirection: 'column' as const,
    padding: 'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  // Главный экран: фикс-shell — фон не скролится, скролит ТОЛЬКО .scroll.
  app: {
    position: 'fixed' as const, inset: 0, backgroundColor: '#15121b',
    display: 'flex', flexDirection: 'column' as const, overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  // Скролл-контейнер контента. overscroll-behavior-x:none + touch-action:pan-y —
  // запрет горизонтального «оттягивания»/свайпа; вертикальная инерция iOS сохранена.
  scroll: {
    flex: 1, overflowY: 'auto' as const, overflowX: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const, overscrollBehaviorY: 'contain' as const, overscrollBehaviorX: 'none' as const,
    touchAction: 'pan-y' as const,
    padding: 'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 20px calc(16px + env(safe-area-inset-left))',
  },
  bottomNav: {
    flexShrink: 0, display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(21,18,27,0.96)', backdropFilter: 'blur(12px)',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  navBtn: {
    flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 0 9px',
  } as React.CSSProperties,

  centered: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '70dvh' },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,
  spinnerSmall: { width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,

  // Экран входа по коду
  codeBox: { display: 'flex', gap: 10, margin: '22px 0 14px', cursor: 'pointer' },
  codeDigit: {
    width: 56, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 36, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' as const,
    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 16,
  } as React.CSSProperties,
  codeCopyBtn: { background: 'transparent', border: 'none', color: '#a78bfa', fontSize: 14, fontWeight: 600, padding: '6px 10px', cursor: 'pointer' } as React.CSSProperties,
  codeTgBtn: {
    marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 15, fontWeight: 700,
    padding: '13px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 10px 28px rgba(109,40,217,0.4)',
  } as React.CSSProperties,

  screenTitle: { color: '#fff', fontSize: 22, fontWeight: 800, margin: '4px 0 16px 2px' },
  fieldLabel: { display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 600, margin: '14px 0 6px 2px' } as React.CSSProperties,
  input: {
    width: '100%', boxSizing: 'border-box' as const, padding: '13px 14px', borderRadius: 12, fontSize: 16,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', outline: 'none',
  } as React.CSSProperties,
  primaryBtn: {
    width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 16, fontWeight: 800,
    boxShadow: '0 10px 28px rgba(109,40,217,0.35)',
  } as React.CSSProperties,
  notice: { padding: '14px 16px', borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', color: '#fbbf24', fontSize: 13.5, lineHeight: 1.5 },
  payOpt: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, cursor: 'pointer' } as React.CSSProperties,
  showMore: {
    width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12, cursor: 'pointer',
    background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 14, fontWeight: 600,
  } as React.CSSProperties,
  // Вторичная кнопка (Отменить ожидание / Выйти) — нейтральная, без заливки.
  secondaryBtn: {
    width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 15, fontWeight: 600,
  } as React.CSSProperties,
  // Кнопка выхода (деструктивный акцент).
  logoutBtn: {
    width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', marginTop: 14,
    background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 15, fontWeight: 700,
  } as React.CSSProperties,
  // Явная ссылка-кнопка на платёжную страницу (фолбэк при блокировке popup).
  payLinkBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' as const,
    padding: '15px 0', borderRadius: 14, marginTop: 12, textDecoration: 'none',
    background: 'linear-gradient(135deg,#8B5CF6,#6d28d9)', color: '#fff', fontSize: 16, fontWeight: 800,
    boxShadow: '0 10px 28px rgba(109,40,217,0.35)',
  } as React.CSSProperties,

  avatar: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid rgba(139,92,246,0.5)' } as React.CSSProperties,
  avatarEdit: {
    position: 'absolute' as const, right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%',
    background: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, border: '2px solid #15121b',
  } as React.CSSProperties,

  card: {
    position: 'relative' as const, height: 200, borderRadius: 22, overflow: 'hidden',
    transformStyle: 'preserve-3d' as const, willChange: 'transform', touchAction: 'none' as const, cursor: 'grab',
    boxShadow: '0 18px 50px rgba(109,40,217,0.35)', userSelect: 'none' as const, WebkitUserSelect: 'none' as const,
  },
  holo: {
    position: 'absolute' as const, inset: 0,
    background: 'linear-gradient(115deg, #6d28d9 0%, #4cd7f6 25%, #ec4899 50%, #f59e0b 70%, #8B5CF6 100%)',
    backgroundSize: '300% 300%', animation: 'holo 8s ease infinite',
  },
  glare: { position: 'absolute' as const, inset: 0, mixBlendMode: 'screen' as const, pointerEvents: 'none' as const },
  cardShade: { position: 'absolute' as const, inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none' as const },
  cardContent: { position: 'relative' as const, zIndex: 2, height: '100%', padding: 22, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between', color: '#fff' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 16, fontWeight: 900, letterSpacing: '3px', textShadow: '0 1px 6px rgba(0,0,0,0.4)' },
  tierBadge: (color: string) => ({ display: 'inline-block', padding: '3px 11px', borderRadius: 20, background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}`, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const }),
  cardBonusLabel: { fontSize: 11, margin: 0, opacity: 0.85, textTransform: 'uppercase' as const, letterSpacing: '1px', textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  cardBonus: { fontSize: 40, fontWeight: 900, fontStyle: 'italic' as const, margin: '2px 0 0', letterSpacing: '-1px', textShadow: '0 2px 10px rgba(0,0,0,0.4)' },
  cardSoon: { fontSize: 22, fontWeight: 800, fontStyle: 'italic' as const, margin: 0, lineHeight: 1.25, maxWidth: 240, textShadow: '0 2px 10px rgba(0,0,0,0.4)' } as React.CSSProperties,
  cardNick: { fontSize: 15, fontWeight: 700, margin: '6px 0 0', opacity: 0.95, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },

  bonusExpiry: { color: '#fbbf24', fontSize: 12, fontWeight: 600, margin: '0 0 14px', textAlign: 'center' as const },

  platesRow: { display: 'flex', gap: 12, marginBottom: 22 },
  plate: (color: string) => ({ flex: 1, background: `${color}14`, border: `1px solid ${color}40`, borderRadius: 16, padding: '14px 16px' }),
  plateLabel: { color: '#94A3B8', fontSize: 12, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  plateValue: (color: string) => ({ color, fontSize: 22, fontWeight: 800, fontStyle: 'italic' as const, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' as const }),

  progressCard: { background: 'rgba(76,215,246,0.08)', border: '1px solid rgba(76,215,246,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 22 },
  progressTrack: { height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' as const },
  progressFill: { height: '100%', borderRadius: 5, background: 'linear-gradient(90deg,#8B5CF6,#4cd7f6)', transition: 'width 0.5s ease' } as React.CSSProperties,
  progressNote: { color: '#94A3B8', fontSize: 12, margin: '8px 0 0' },

  feedTitle: { color: '#94A3B8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px 4px' },
  feed: { background: 'rgba(29,26,36,0.8)', borderRadius: 18, border: '1px solid rgba(139,92,246,0.15)', overflow: 'hidden' },
  txRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' },
  txDesc: { color: '#e2e8f0', fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  txDate: { color: '#94A3B8', fontSize: 12, margin: '2px 0 0' },
  txAmount: (positive: boolean) => ({ color: positive ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }),
}
