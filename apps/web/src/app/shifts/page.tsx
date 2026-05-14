'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Clock, TrendingUp, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useCurrentShift, useOpenShift, useCloseShift } from '@/hooks/useShift'
import { formatDistanceToNow, format } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function ShiftsPage() {
  const router = useRouter()
  const { data: shift } = useCurrentShift()
  const openShift = useOpenShift()
  const closeShift = useCloseShift()

  const { data: historyData } = useQuery({
    queryKey: ['shifts', 'history'],
    queryFn: () => api.get<{ shifts: any[] }>('/shifts/history'),
  })

  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [cashStart, setCashStart] = useState('0')
  const [cashEnd, setCashEnd] = useState('0')
  const [eveningType, setEveningType] = useState('none')
  const [closeResult, setCloseResult] = useState<any>(null)

  async function handleClose() {
    const res = await closeShift.mutateAsync({ cashEnd: Number(cashEnd) })
    setCloseResult(res)
    setShowClose(false)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg">Смены</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Current shift card */}
        {shift ? (
          <div className="rounded-2xl bg-surface border border-border p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium text-green-400">Смена открыта</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {formatDistanceToNow(new Date(shift.openedAt), { locale: ru, addSuffix: true })}
                </p>
              </div>
              <button
                onClick={() => setShowClose(true)}
                className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Начало: {format(new Date(shift.openedAt), 'dd MMM, HH:mm', { locale: ru })}</p>
            <p className="text-xs text-muted-foreground">Касса: {parseFloat(shift.cashStart).toLocaleString('ru')} ₽</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-border p-5 text-center">
            <p className="text-muted-foreground text-sm mb-4">Смена не открыта</p>
            <button
              onClick={() => setShowOpen(true)}
              className="px-6 py-3 rounded-xl bg-primary text-white font-semibold"
            >
              Открыть смену
            </button>
          </div>
        )}

        {/* Close result */}
        {closeResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-green-500/10 border border-green-500/20 p-5">
            <p className="font-semibold text-green-400 mb-3">Смена закрыта</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Выручка</span>
                <span>{parseFloat(closeResult.analytics?.totalRevenue ?? 0).toLocaleString('ru')} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Чеков</span>
                <span>{closeResult.analytics?.checksCount ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Средний чек</span>
                <span>{parseFloat(closeResult.analytics?.avgCheck ?? 0).toFixed(0)} ₽</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* History */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">История смен</h2>
          <div className="space-y-2">
            {historyData?.shifts.map((row: any) => (
              <div key={row.shift.id} className="rounded-xl bg-surface border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{format(new Date(row.shift.openedAt), 'dd MMM yyyy', { locale: ru })}</p>
                    <p className="text-xs text-muted-foreground">{row.openedByNickname}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-lg ${row.shift.status === 'open' ? 'bg-green-500/10 text-green-400' : 'bg-muted/20 text-muted-foreground'}`}>
                    {row.shift.status === 'open' ? 'Открыта' : 'Закрыта'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Open shift modal */}
      <AnimatePresence>
        {showOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Открыть смену</h2>
                <button onClick={() => setShowOpen(false)}><X size={20} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Наличные в начале</label>
                  <input type="number" value={cashStart} onChange={e => setCashStart(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип вечера</label>
                  <select value={eveningType} onChange={e => setEveningType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white">
                    <option value="none">Обычный</option>
                    <option value="sport_mafia">Спортивная мафия</option>
                    <option value="city_mafia">Городская мафия</option>
                    <option value="kids_mafia">Детская мафия</option>
                    <option value="board_games">Настольные игры</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowOpen(false)} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground">Отмена</button>
                  <button
                    onClick={async () => { await openShift.mutateAsync({ cashStart: Number(cashStart), eveningType }); setShowOpen(false) }}
                    disabled={openShift.isPending}
                    className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold"
                  >Открыть</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close shift modal */}
      <AnimatePresence>
        {showClose && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Закрыть смену</h2>
                <button onClick={() => setShowClose(false)}><X size={20} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Наличные в конце</label>
                  <input type="number" value={cashEnd} onChange={e => setCashEnd(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowClose(false)} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground">Отмена</button>
                  <button onClick={handleClose} disabled={closeShift.isPending}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold">
                    {closeShift.isPending ? 'Закрываем...' : 'Закрыть'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
