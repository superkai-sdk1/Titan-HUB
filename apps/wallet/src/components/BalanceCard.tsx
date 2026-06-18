import { useRef, useState } from 'react'
import { styles } from './styles'

// Голографическая карта баланса с 3D-наклоном за пальцем.
// Денежная/бонусная разметка не изменена — только вынесена из page.tsx.
export function BalanceCard({
  tierColor, tierLabel, bonus, bonusHidden, nickname,
}: {
  tierColor: string
  tierLabel: string
  bonus: number
  bonusHidden: boolean
  nickname: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false })

  function onMove(e: React.PointerEvent) {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setTilt({ rx: -(py - 0.5) * 26, ry: (px - 0.5) * 26, gx: px * 100, gy: py * 100, active: true })
  }
  function onEnd() { setTilt(t => ({ ...t, rx: 0, ry: 0, gx: 50, gy: 50, active: false })) }

  return (
    <div style={{ perspective: '1000px', marginBottom: 16 }}>
      <div
        ref={cardRef}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerUp={onEnd}
        onPointerLeave={onEnd}
        onPointerCancel={onEnd}
        style={{
          ...styles.card,
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.02 : 1})`,
          transition: tilt.active ? 'transform 0.06s linear' : 'transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={styles.holo} />
        <div style={{ ...styles.glare, background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.5), rgba(255,255,255,0) 45%)` }} />
        <div style={styles.cardShade} />
        <div style={styles.cardContent}>
          <div style={styles.cardTop}>
            <span style={styles.brand}>TITAN</span>
            <span style={styles.tierBadge(tierColor)}>{tierLabel}</span>
          </div>
          <div>
            {bonusHidden ? (
              <p style={styles.cardSoon}>Скоро тут появятся бонусы ⭐</p>
            ) : (
              <>
                <p style={styles.cardBonusLabel}>Бонусный баланс</p>
                <p style={styles.cardBonus}>{bonus.toLocaleString('ru')} <span style={{ fontSize: 24 }}>⭐</span></p>
              </>
            )}
            <p style={styles.cardNick}>@{nickname || 'гость'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
