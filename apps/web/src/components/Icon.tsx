import React from 'react'

interface IconProps {
  name: string
  size?: number
  color?: string
  style?: React.CSSProperties
  className?: string
}

/* ─── SVG ICON LIBRARY ─────────────────────────────────────────
   All icons: 24×24 viewBox, stroke-based, strokeWidth 1.75
   Uses CSS `color` prop via currentColor for both stroke & fills
──────────────────────────────────────────────────────────────── */
const ICONS: Record<string, React.ReactNode> = {

  /* ── Navigation ─────────────────────────────────────────── */
  add: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  close: (
    <path d="M18 6L6 18M6 6l12 12" />
  ),
  remove: (
    <line x1="5" y1="12" x2="19" y2="12" />
  ),
  arrow_back: (
    <path d="M19 12H5M12 19l-7-7 7-7" />
  ),
  arrow_forward: (
    <path d="M5 12h14M12 5l7 7-7 7" />
  ),
  arrow_downward: (
    <path d="M12 5v14M19 12l-7 7-7-7" />
  ),
  chevron_left: (
    <polyline points="15 18 9 12 15 6" />
  ),
  chevron_right: (
    <polyline points="9 18 15 12 9 6" />
  ),
  expand_more: (
    <polyline points="6 9 12 15 18 9" />
  ),
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),

  /* ── Actions ────────────────────────────────────────────── */
  edit: (
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  ),
  delete: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  search_off: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19 19l-3.5-3.5" />
      <line x1="8" y1="8" x2="13" y2="13" />
      <line x1="13" y1="8" x2="8" y2="13" />
    </>
  ),
  refresh: (
    <>
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </>
  ),
  undo: (
    <>
      <polyline points="3 7 3 13 9 13" />
      <path d="M3 13a9 9 0 109 9" />
    </>
  ),
  print: (
    <>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </>
  ),
  send: (
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  open_in_new: (
    <>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>
  ),

  /* ── Status / Feedback ──────────────────────────────────── */
  check_circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  warning: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <circle cx="12" cy="8.5" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  cancel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),
  progress_activity: (
    <path d="M12 3a9 9 0 100 18" strokeLinecap="round" />
  ),
  radio_button_unchecked: (
    <circle cx="12" cy="12" r="9" />
  ),
  done_all: (
    <>
      <polyline points="2 12 6 16 14 8" />
      <polyline points="9 12 13 16 21 8" />
    </>
  ),
  check: (
    <polyline points="20 6 9 17 4 12" />
  ),
  block: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </>
  ),

  /* ── UI Controls ────────────────────────────────────────── */
  drag_indicator: (
    <>
      <circle cx="9" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  star: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  tune: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="10" cy="6" r="2.5" />
      <circle cx="16" cy="12" r="2.5" />
      <circle cx="8" cy="18" r="2.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  add_circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  remove_circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
  notifications: (
    <>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </>
  ),
  notifications_off: (
    <>
      <path d="M13.73 21a2 2 0 01-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0118 8" />
      <path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 00-9.33-5" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </>
  ),
  done_all_off: (
    <path d="M3 15l4 4 3-3M8 9l4 4M12 5l7-5" />
  ),
  update: (
    <>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0115-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 01-15 6.7L3 16" />
    </>
  ),

  /* ── Business / POS ─────────────────────────────────────── */
  point_of_sale: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <path d="M3 11h18" />
      <rect x="5" y="13" width="14" height="8" rx="1" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-3 2V2z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </>
  ),
  receipt_long: (
    <>
      <path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-3 2V2z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="10.5" x2="16" y2="10.5" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="17.5" x2="13" y2="17.5" />
    </>
  ),
  payments: (
    <>
      <rect x="1" y="5" width="22" height="14" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <circle cx="6.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.3" stroke="currentColor" />
      <circle cx="9.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.3" stroke="currentColor" />
    </>
  ),
  account_balance: (
    <>
      <path d="M3 21h18" />
      <path d="M3 10h18" />
      <path d="M5 10l7-7 7 7" />
      <line x1="6" y1="10" x2="6" y2="21" />
      <line x1="10" y1="10" x2="10" y2="21" />
      <line x1="14" y1="10" x2="14" y2="21" />
      <line x1="18" y1="10" x2="18" y2="21" />
    </>
  ),
  discount: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <line x1="8" y1="14" x2="14" y2="8" />
      <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  confirmation_number: (
    <>
      <path d="M2 9a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 010 4v3a2 2 0 01-2 2H4a2 2 0 01-2-2v-3a2 2 0 010-4V9z" />
      <line x1="9" y1="7" x2="9" y2="17" strokeDasharray="2 2" />
    </>
  ),
  calculate: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <rect x="7" y="6" width="10" height="4" rx="1" />
      <circle cx="8.5" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  bar_chart: (
    <>
      <rect x="4" y="11" width="4" height="10" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
      <rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
      <rect x="16" y="2" width="4" height="19" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 20l5-6 4 4 5-8 4 5" strokeLinejoin="round" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </>
  ),
  salary: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h4a2 2 0 010 4H9v4" />
      <line x1="9" y1="9" x2="9" y2="17" />
      <line x1="9" y1="13" x2="13" y2="13" />
    </>
  ),

  /* ── People ─────────────────────────────────────────────── */
  person: (
    <>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  person_add: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="16" y1="11" x2="22" y2="11" />
    </>
  ),
  person_off: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="17" y1="9" x2="23" y2="15" />
      <line x1="23" y1="9" x2="17" y2="15" />
    </>
  ),
  group: (
    <>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </>
  ),
  groups: (
    <>
      <circle cx="9" cy="7.5" r="3.5" />
      <circle cx="17" cy="7.5" r="2.5" />
      <path d="M2 21v-1a7 7 0 0114 0v1" />
      <path d="M16 12a5 5 0 018 0v1" />
    </>
  ),
  fingerprint: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10a4 4 0 014 4c0 2-1.5 4-1.5 6" />
      <path d="M12 10a4 4 0 00-4 4c0 2 1.5 4 1.5 6" />
      <path d="M12 6a8 8 0 018 8c0 3-2 5-2 8" />
      <path d="M12 6a8 8 0 00-8 8c0 3 2 5 2 8" />
    </>
  ),
  pin: (
    <>
      <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="21.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  dialpad: (
    <>
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="21" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  support_agent: (
    <>
      <path d="M12 3a9 9 0 00-9 9" />
      <path d="M12 3a9 9 0 019 9" />
      <rect x="2" y="12" width="3" height="5" rx="1.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
      <rect x="19" y="12" width="3" height="5" rx="1.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
      <path d="M22 17v1a2 2 0 01-2 2h-2" />
      <path d="M18 20h-2a2 2 0 000 4h2" />
    </>
  ),
  psychology: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M10 14v3h4v-3" />
      <line x1="10" y1="17" x2="14" y2="17" />
      <path d="M9.5 7c.5-1 1.5-1.5 2.5-1.5s2 .5 2.5 1.5" />
      <line x1="12" y1="7" x2="12" y2="10" />
    </>
  ),

  /* ── Venue / Space ──────────────────────────────────────── */
  meeting_room: (
    <>
      <path d="M3 22h18" />
      <rect x="7" y="2" width="10" height="20" rx="1.5" />
      <circle cx="14.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  table_bar: (
    <>
      <rect x="3" y="5" width="18" height="5" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" />
      <line x1="8.5" y1="10" x2="7" y2="21" />
      <line x1="15.5" y1="10" x2="17" y2="21" />
    </>
  ),
  tablet_mac: (
    <>
      <rect x="4" y="1" width="16" height="22" rx="2.5" />
      <circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none" />
      <line x1="8" y1="5" x2="16" y2="5" />
    </>
  ),
  event: (
    <>
      <rect x="3" y="5" width="18" height="17" rx="2" />
      <path d="M16 2v6M8 2v6" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  schedule: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 3" />
    </>
  ),
  stop_circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.3" stroke="currentColor" />
    </>
  ),

  /* ── Inventory / Products ───────────────────────────────── */
  restaurant_menu: (
    <>
      <path d="M4 2h12l4 4v16H4V2z" />
      <path d="M14 2v4h4" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="11" y2="17" />
    </>
  ),
  category: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" />
    </>
  ),
  inventory_2: (
    <>
      <path d="M21 8V21H3V8" />
      <path d="M23 3H1v5h22V3z" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </>
  ),

  /* ── Shopping ───────────────────────────────────────────── */
  shopping_cart: (
    <>
      <circle cx="9" cy="21" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="21" r="1.5" fill="currentColor" stroke="none" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.96-1.58L23 6H6" />
    </>
  ),
  add_shopping_cart: (
    <>
      <circle cx="9" cy="21" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="21" r="1.5" fill="currentColor" stroke="none" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h7.72" />
      <line x1="16" y1="6" x2="22" y2="6" strokeWidth="2.5" />
      <line x1="19" y1="3" x2="19" y2="9" strokeWidth="2.5" />
    </>
  ),
  card_giftcard: (
    <>
      <rect x="1" y="5" width="22" height="14" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <path d="M12 5v14" />
      <path d="M9.5 5A2.5 2.5 0 0112 7.5 2.5 2.5 0 0114.5 5" />
    </>
  ),
  add_card: (
    <>
      <rect x="1" y="5" width="22" height="14" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <line x1="16" y1="15" x2="20" y2="15" />
      <line x1="18" y1="13" x2="18" y2="17" />
    </>
  ),

  /* ── Documents / Info ───────────────────────────────────── */
  description: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="11" y2="17" />
    </>
  ),
  fact_check: (
    <>
      <path d="M9 5H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-4" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </>
  ),
  gavel: (
    <>
      <path d="M14 2L2 14l3 3L17 5l-3-3z" />
      <path d="M19 19L9 9" />
      <line x1="14" y1="20" x2="22" y2="20" />
    </>
  ),
  privacy_tip: (
    <>
      <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7L12 2z" />
      <line x1="12" y1="11" x2="12" y2="15" />
      <circle cx="12" cy="8.5" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  commit: (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.3" stroke="currentColor" />
      <line x1="2" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="22" y2="12" />
    </>
  ),
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </>
  ),
}

export function Icon({ name, size = 24, color, style, className }: IconProps) {
  const paths = ICONS[name]
  if (!paths) {
    // Unknown icon: render a placeholder square
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color || 'currentColor'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: color || 'currentColor', flexShrink: 0, ...style }}
        className={className}
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: color || 'currentColor', flexShrink: 0, ...style }}
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}
