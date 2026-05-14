type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'error'

const patterns: Record<HapticStyle, number[]> = {
  light: [10],
  medium: [20],
  heavy: [50],
  success: [10, 50, 10],
  error: [50, 30, 50],
}

export function haptic(style: HapticStyle = 'light') {
  if (typeof window === 'undefined') return

  // Telegram WebApp haptic
  const tg = (window as any).Telegram?.WebApp?.HapticFeedback
  if (tg) {
    if (style === 'success') tg.notificationOccurred('success')
    else if (style === 'error') tg.notificationOccurred('error')
    else tg.impactOccurred(style === 'heavy' ? 'heavy' : style === 'medium' ? 'medium' : 'light')
    return
  }

  // Fallback to navigator.vibrate
  if ('vibrate' in navigator) {
    navigator.vibrate(patterns[style])
  }
}
