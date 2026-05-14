'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, Package, ShoppingBag, AlertCircle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useCurrentShift, useOpenShift } from '@/hooks/useShift'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

interface CheckCard {
  id: string
  createdAt: string
  totalAmount: string
  itemCount: number
  status: string
  note?: string
}

export default function PosPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  const { data: shift, isLoading: shiftLoading } = useCurrentShift()
  const openShift = useOpenShift()

  const { data: checksData, isLoading } = useQuery({
    queryKey: ['checks', 'active'],
    queryFn: () => api.get<{ checks: CheckCard[] }>('/pos/checks'),
    refetchInterval: 5000,
    enabled: !!shift,
  })

  const createCheck = useMutation({
    mutationFn: (body: { note?: string }) => api.post<{ check: { id: string } }>('/pos/checks', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['checks'] })
      router.push(`/pos/${res.check.id}`)
    },
  })

  const [showOpenShift, setShowOpenShift] = useState(false)
  const [cashStart, setCashStart] = useState('0')
  const [eveningType, setEveningType] = useState('none')

  const checks = checksData?.checks ?? []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Касса</h1>
            {shift ? (
              <p className="text-xs text-muted-foreground">
                Смена открыта · {formatDistanceToNow(new Date(shift.openedAt), { locale: ru, addSuffix: false })}
              </p>
            ) : (
              <p className="text-xs text-amber-400">Смена не открыта</p>
            )}
          </div>
          <button
            onClick={() => router.push('/shifts')}
            className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground"
          >
            Смены
          </button>
        </div>
      </div>

      {/* No shift warning */}
      {!shiftLoading && !shift && (
        <div className="mx-4 mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertCircle className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-sm font-medium text-amber-300">Смена не открыта</p>
            <p className="text-xs text-muted-foreground mt-0.5">Откройте смену чтобы начать работу</p>
            <button
              onClick={() => setShowOpenShift(true)}
              className="mt-2 px-4 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold"
            >
              Открыть смену
            </button>
          </div>
        </div>
      )}

      {/* Checks grid */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <AnimatePresence>
          {checks.map((check) => (
            <motion.button
              key={check.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => router.push(`/pos/${check.id}`)}
              className="p-4 rounded-2xl bg-surface border border-border text-left active:scale-95 transition-transform"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {formatDistanceToNow(new Date(check.createdAt), { locale: ru, addSuffix: false })}
                </span>
                <span className="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <p className="text-xl font-bold">{parseFloat(check.totalAmount).toLocaleString('ru')} ₽</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Package size={12} />
                <span>{check.itemCount} поз.</span>
              </div>
              {check.note && <p className="mt-1 text-xs text-muted-foreground truncate">{check.note}</p>}
            </motion.button>
          ))}
        </AnimatePresence>

        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-surface animate-pulse" />
        ))}

        {!isLoading && checks.length === 0 && shift && (
          <div className="col-span-2 flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingBag size={48} strokeWidth={1} className="mb-3 opacity-30" />
            <p className="text-sm">Нет открытых чеков</p>
            <p className="text-xs mt-1">Нажмите + чтобы создать</p>
          </div>
        )}
      </div>

      {/* FAB */}
      {shift && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => createCheck.mutate({})}
          disabled={createCheck.isPending}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 z-50"
        >
          <Plus size={28} />
        </motion.button>
      )}

      {/* Open shift modal */}
      <AnimatePresence>
        {showOpenShift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full bg-surface rounded-t-3xl p-6 safe-bottom"
            >
              <h2 className="text-xl font-bold mb-6">Открыть смену</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Наличные в начале</label>
                  <input
                    type="number"
                    value={cashStart}
                    onChange={e => setCashStart(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип вечера</label>
                  <select
                    value={eveningType}
                    onChange={e => setEveningType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white"
                  >
                    <option value="none">Обычный</option>
                    <option value="sport_mafia">Спортивная мафия</option>
                    <option value="city_mafia">Городская мафия</option>
                    <option value="kids_mafia">Детская мафия</option>
                    <option value="board_games">Настольные игры</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowOpenShift(false)} className="flex-1 py-3 rounded-xl border border-border text-muted-foreground">
                    Отмена
                  </button>
                  <button
                    onClick={async () => {
                      await openShift.mutateAsync({ cashStart: Number(cashStart), eveningType })
                      setShowOpenShift(false)
                    }}
                    disabled={openShift.isPending}
                    className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold"
                  >
                    Открыть
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
