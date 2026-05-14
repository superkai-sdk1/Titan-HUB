'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'
import { useAuthStore } from '@/store/auth.store'

export default function SettingsPage() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [settings, setSettings] = useState<Record<string, string>>({})

  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<any>('/system/settings') })

  useEffect(() => {
    if (data?.settings) setSettings(data.settings)
  }, [data])

  const save = useMutation({
    mutationFn: (body: any) => api.patch('/system/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <ManageLayout title="Настройки">
      <div className="rounded-2xl bg-surface border border-border p-4 mb-4">
        <p className="text-xs text-muted-foreground mb-1">Текущий пользователь</p>
        <p className="font-medium">{user?.nickname}</p>
        <p className="text-xs text-muted-foreground">{user?.role}</p>
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground mb-3">Настройки системы</h3>
      <div className="space-y-3">
        {[
          { key: 'club_name', label: 'Название клуба' },
          { key: 'bonus_percent', label: 'Процент начисления бонусов' },
          { key: 'min_salary', label: 'Минимальная зарплата' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <input
              value={settings[key] ?? ''}
              onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-white"
            />
          </div>
        ))}
        <button
          onClick={() => save.mutate(settings)}
          disabled={save.isPending}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
        >
          {save.isPending ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>
    </ManageLayout>
  )
}
