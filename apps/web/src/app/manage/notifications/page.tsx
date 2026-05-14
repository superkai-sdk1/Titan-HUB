'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<any>('/notifications') })

  const readAll = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <ManageLayout title="Уведомления" action={
      <button onClick={() => readAll.mutate()} className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground flex items-center gap-1">
        <CheckCheck size={14} />Прочитать все
      </button>
    }>
      <div className="space-y-2">
        {data?.notifications?.map((n: any) => (
          <div key={n.id} className={`rounded-xl border p-3 ${n.isRead ? 'bg-surface/50 border-border/50' : 'bg-surface border-primary/30'}`}>
            <p className="text-sm font-medium">{n.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString('ru')}</p>
          </div>
        ))}
        {!data?.notifications?.length && (
          <p className="text-center text-muted-foreground py-8 text-sm">Уведомлений нет</p>
        )}
      </div>
    </ManageLayout>
  )
}
