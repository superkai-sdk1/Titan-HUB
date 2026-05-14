'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const REASON_LABELS: Record<string, string> = { return: 'Возврат', exchange: 'Обмен', discount: 'Скидка', damage: 'Повреждение' }

export default function RefundsPage() {
  const { data } = useQuery({ queryKey: ['refunds'], queryFn: () => api.get<any>('/refunds') })

  return (
    <ManageLayout title="Возвраты">
      <div className="space-y-2">
        {data?.refunds?.map((r: any) => (
          <div key={r.id} className="rounded-xl bg-surface border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{REASON_LABELS[r.reason]} · {r.refundType === 'full' ? 'Полный' : 'Частичный'}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('ru')}</p>
                {r.note && <p className="text-xs text-muted-foreground mt-0.5">{r.note}</p>}
              </div>
              <p className="text-sm font-semibold text-red-400">−{parseFloat(r.totalAmount).toLocaleString('ru')} ₽</p>
            </div>
          </div>
        ))}
        {!data?.refunds?.length && (
          <p className="text-center text-muted-foreground py-8 text-sm">Возвратов нет</p>
        )}
      </div>
    </ManageLayout>
  )
}
