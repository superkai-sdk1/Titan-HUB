import { styles } from './styles'
import { formatAmount, formatDate, type FeedItem } from '../hooks/money'

// Одна строка единого фида (деньги + бонусы). Кликабельна только при checkId.
export function FeedRow({ item, onOpenCheck }: { item: FeedItem; onOpenCheck: (checkId: string) => void }) {
  const clickable = !!item.checkId
  return (
    <div
      onClick={() => item.checkId && onOpenCheck(item.checkId)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.checkId && onOpenCheck(item.checkId) } } : undefined}
      style={{ ...styles.txRow, cursor: clickable ? 'pointer' : 'default' }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden="true">{item.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.txDesc}>{item.label}{item.checkId ? ' ›' : ''}</p>
        <p style={styles.txDate}>{formatDate(item.date)}</p>
      </div>
      <span style={styles.txAmount(item.sign > 0)}>
        {item.sign > 0 ? '+' : '−'}{item.unit === '⭐' ? Math.round(item.amount).toLocaleString('ru') : formatAmount(item.amount)} {item.unit}
      </span>
    </div>
  )
}
