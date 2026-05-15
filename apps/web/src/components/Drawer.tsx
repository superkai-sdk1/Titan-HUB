'use client'
import { useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
  /** Высота drawer. По умолчанию '90dvh'. Можно передать '95dvh' для большого контента */
  snapHeight?: string
}

/**
 * Умный Drawer с drag-dismiss:
 * - Тянем ручку вниз → закрывается при смещении >120px или velocity >600px/s
 * - Scroll-защита: если содержимое НЕ прокручено в самый верх — drag не активируется
 * - При маленьком смещении (<40px) — резиновый эффект и возврат на место
 * - Overlay tap → закрыть
 */
export function Drawer({ open, onClose, title, subtitle, icon, children, snapHeight = '92dvh' }: DrawerProps) {
  const dragY = useMotionValue(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Opacity overlay привязан к drag: при y=0 → 1, при y=300 → 0
  const overlayOpacity = useTransform(dragY, [0, 280], [1, 0])
  // Scale контейнера при тянутии вниз (лёгкое сжатие)
  const panelScale = useTransform(dragY, [0, 200], [1, 0.97])

  // Сбрасываем drag при открытии/закрытии
  useEffect(() => {
    if (open) animate(dragY, 0, { duration: 0 })
  }, [open, dragY])

  const DISMISS_THRESHOLD = 120   // px
  const DISMISS_VELOCITY  = 600   // px/s
  const SCROLL_LOCK_SLACK = 4     // px — разрешённый scrollTop до блокировки drag

  const handleDragEnd = useCallback((_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
    const shouldDismiss =
      info.offset.y > DISMISS_THRESHOLD ||
      info.velocity.y > DISMISS_VELOCITY

    if (shouldDismiss) {
      // Анимируем вниз и закрываем
      animate(dragY, 600, { duration: 0.25, ease: [0.32, 0.72, 0, 1] }).then(onClose)
    } else {
      // Возврат на место
      animate(dragY, 0, { type: 'spring', damping: 30, stiffness: 350 })
    }
  }, [dragY, onClose])

  return (
    <AnimatePresence onExitComplete={() => animate(dragY, 0, { duration: 0 })}>
      {open && (
        <>
          {/* ─── Overlay ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              opacity: overlayOpacity,
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
            onClick={onClose}
          />

          {/* ─── Panel ───────────────────────────────────────────── */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, restDelta: 0.5 }}
            style={{
              y: dragY,
              scale: panelScale,
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              zIndex: 61,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div
              className="glass-1"
              style={{
                width: '100%',
                maxWidth: 560,
                maxHeight: snapHeight,
                borderRadius: '28px 28px 0 0',
                boxShadow: 'var(--sh-drawer)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* ─── Drag handle zone ──────────────────── */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.18 }}
                dragDirectionLock
                onDragStart={() => {
                  // Блокируем drag если содержимое прокручено
                  if ((scrollRef.current?.scrollTop ?? 0) > SCROLL_LOCK_SLACK) {
                    // Возвращаем в 0 и отпускаем
                    animate(dragY, 0, { duration: 0 })
                    return false
                  }
                }}
                onDrag={(_, info) => {
                  if ((scrollRef.current?.scrollTop ?? 0) > SCROLL_LOCK_SLACK) return
                  const raw = info.offset.y
                  // Только вниз, с мягкой резиной
                  dragY.set(raw > 0 ? raw : raw * 0.15)
                }}
                onDragEnd={handleDragEnd}
                style={{
                  padding: '16px 24px 8px',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                {/* Handle pill */}
                <div style={{
                  width: 40, height: 4,
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  margin: '0 auto',
                  transition: 'background 0.2s',
                }} />
              </motion.div>

              {/* ─── Header ────────────────────────────── */}
              {(title || icon) && (
                <div
                  className="ti-fade-in"
                  style={{
                    display: 'flex', alignItems: 'flex-start',
                    gap: 12, padding: '4px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                  }}
                >
                  {icon && (
                    <div style={{
                      width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                      background: 'rgba(139,92,246,0.15)',
                      border: '1px solid rgba(139,92,246,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {icon}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {title && (
                      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>
                        {title}
                      </h2>
                    )}
                    {subtitle && (
                      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--on-surface-variant)',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
              )}

              {/* ─── Scrollable content ────────────────── */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  padding: '20px 24px 48px',
                }}
              >
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
