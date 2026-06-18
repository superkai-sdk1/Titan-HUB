import { useEffect, useRef, useState } from 'react'

/**
 * Анимирует число от ПРЕДЫДУЩЕГО значения к новому target за duration мс.
 *
 * Важно (фикс «сброса в 0»): анимируем from→to, а НЕ 0→to при каждом маунте.
 * При рефетче (например, refetchInterval 60с) карточки больше не «обнуляются
 * и набегают» — если число не изменилось, кадры rAF вообще не запускаются.
 *
 * Уважает prefers-reduced-motion: при включённой настройке (или при первом
 * появлении) значение проставляется мгновенно, без анимации и лишних rAF.
 *
 * @example
 *   const displayed = useCountUp(revenue, 800)
 *   <span>{formatMoney(displayed)}</span>
 */
export function useCountUp(target: number, duration = 700): number {
  // Стартуем СРАЗУ с target (а не с 0): при первом маунте число не «прибегает»
  // от нуля — это и убирало мигание при каждой смене вкладки/периода/рефетче.
  const [value, setValue] = useState(target)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(target)
  // Текущее отображаемое значение — для расчёта стартовой точки следующей анимации
  // без добавления `value` в deps (иначе анимация перезапускалась бы на каждом кадре).
  const valueRef = useRef(target)
  valueRef.current = value
  const mountedRef = useRef(false)

  useEffect(() => {
    // Первый эффект-проход — это маунт: значение уже равно target, не анимируем.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    // Значение не изменилось — ничего не делаем (нет лишних rAF на iPhone).
    if (valueRef.current === target) return

    // prefers-reduced-motion → мгновенно, без анимации.
    const prefersReduced = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setValue(target)
      return
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    fromRef.current = valueRef.current  // анимируем ОТ текущего значения, не от 0
    startRef.current = null

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setValue(target)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
