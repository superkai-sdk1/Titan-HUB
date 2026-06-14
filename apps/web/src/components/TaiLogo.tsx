'use client'
import React, { useId } from 'react'

// Фирменный знак Tai (ассистент Titan AI) — «AI-искра».
//  • animated=true  — парение/пульсация/орбиты + анимированный градиент (для шапки,
//    пустого экрана, кнопок навигации, индикатора «думает»).
//  • animated=false — статичная искра с фикс. градиентом (для аватарок в каждом
//    сообщении — без нагрузки от десятков анимаций).
//  • thinking=true  — ускоренная анимация (индикатор размышления).
//  • float — плавное парение вверх-вниз (выключаем в навигации/индикаторе).
// Градиенты получают уникальные id (useId), чтобы несколько лого на странице не
// конфликтовали. Уважает prefers-reduced-motion.

export function TaiLogo({
  size = 40, animated = true, thinking = false, float = true, glow = true,
}: { size?: number; animated?: boolean; thinking?: boolean; float?: boolean; glow?: boolean }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const cls = `tai${raw}`
  const gA = `${cls}A`
  const gI = `${cls}I`
  const dur = thinking ? '1.6s' : '4s'
  const floatDur = thinking ? '2.6s' : '6s'
  const gradDur = thinking ? '2.6s' : '6s'
  const glowMin = Math.max(4, Math.round(size * 0.12))
  const glowMax = Math.max(10, Math.round(size * 0.3))

  const css = !animated ? '' : `
    .${cls}-wrap { ${float ? `animation: ${cls}-float ${floatDur} ease-in-out infinite;` : ''} }
    .${cls}-main { animation: ${cls}-breathe ${dur} cubic-bezier(0.4,0,0.2,1) infinite; transform-origin: 50px 50px; ${glow ? `filter: drop-shadow(0 0 ${glowMin}px rgba(130,88,242,0.35));` : ''} }
    .${cls}-inner { animation: ${cls}-inner ${dur} cubic-bezier(0.4,0,0.2,1) infinite; transform-origin: 50px 50px; }
    .${cls}-p1 { animation: ${cls}-orbitR ${dur} linear infinite; transform-origin: 50px 50px; }
    .${cls}-p2 { animation: ${cls}-orbitL ${thinking ? '2s' : '5s'} linear infinite; transform-origin: 50px 50px; }
    @keyframes ${cls}-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6%)} }
    @keyframes ${cls}-breathe { 0%,100%{transform:scale(1) rotate(0deg);${glow ? `filter:drop-shadow(0 0 ${glowMin}px rgba(130,88,242,0.4))` : ''}} 50%{transform:scale(1.15) rotate(45deg);${glow ? `filter:drop-shadow(0 0 ${glowMax}px rgba(160,125,255,0.9))` : ''}} }
    @keyframes ${cls}-inner { 0%,100%{transform:scale(1) rotate(0deg);opacity:.9} 50%{transform:scale(.6) rotate(-45deg);opacity:1} }
    @keyframes ${cls}-orbitR { from{transform:rotate(0) translateX(38px) rotate(0)} to{transform:rotate(360deg) translateX(38px) rotate(-360deg)} }
    @keyframes ${cls}-orbitL { from{transform:rotate(360deg) translateX(42px) rotate(-360deg)} to{transform:rotate(0) translateX(42px) rotate(0)} }
    @media (prefers-reduced-motion: reduce){ .${cls}-wrap,.${cls}-main,.${cls}-inner,.${cls}-p1,.${cls}-p2{animation:none!important} }
  `

  return (
    <div className={`${cls}-wrap`} style={{ width: size, height: size, flexShrink: 0, display: 'inline-block', lineHeight: 0 }}>
      {animated && <style>{css}</style>}
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }} aria-hidden="true">
        <defs>
          <linearGradient id={gA} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A07DFF">
              {animated && <animate attributeName="stop-color" values="#A07DFF;#3D1C9A;#8258F2;#A07DFF" dur={gradDur} repeatCount="indefinite" />}
            </stop>
            <stop offset="100%" stopColor="#5332B3">
              {animated && <animate attributeName="stop-color" values="#5332B3;#A07DFF;#3D1C9A;#5332B3" dur={gradDur} repeatCount="indefinite" />}
            </stop>
          </linearGradient>
          <linearGradient id={gI} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#E0C3FC" />
          </linearGradient>
        </defs>
        {animated && <circle className={`${cls}-p1`} cx="50" cy="50" r="2.5" fill="#A07DFF" opacity="0.9" />}
        {animated && <circle className={`${cls}-p2`} cx="50" cy="50" r="1.5" fill="#ffffff" opacity="0.7" />}
        <path className={`${cls}-main`} d="M50,5 Q50,45 90,50 Q50,55 50,95 Q50,55 10,50 Q50,45 50,5" fill={`url(#${gA})`} />
        <path className={`${cls}-inner`} d="M50,25 Q50,45 70,50 Q50,55 50,75 Q50,55 30,50 Q50,45 50,25" fill={`url(#${gI})`} />
      </svg>
    </div>
  )
}
