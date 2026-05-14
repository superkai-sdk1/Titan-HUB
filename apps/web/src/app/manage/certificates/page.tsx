'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Copy, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

export default function CertificatesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [nominal, setNominal] = useState('500')
  const [copied, setCopied] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ['certificates'], queryFn: () => api.get<any>('/certificates') })

  const create = useMutation({
    mutationFn: () => api.post('/certificates', { nominal: Number(nominal) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['certificates'] }); setShowForm(false) },
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.put(`/certificates/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  })

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <ManageLayout title="Сертификаты" action={<button onClick={() => setShowForm(true)} className="p-2 text-primary"><Plus size={22} /></button>}>
      <div className="space-y-2">
        {data?.certificates?.map((cert: any) => (
          <div key={cert.id} className={`rounded-xl bg-surface border p-3 ${cert.isUsed ? 'border-border opacity-50' : 'border-border'}`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-bold tracking-widest">{cert.code}</p>
                  <button onClick={() => copyCode(cert.code)} className="text-muted-foreground">
                    {copied === cert.code ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Номинал: {parseFloat(cert.nominal).toLocaleString('ru')} ₽ · Остаток: {parseFloat(cert.balance).toLocaleString('ru')} ₽
                </p>
              </div>
              {!cert.isUsed && (
                <button onClick={() => deactivate.mutate(cert.id)} className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400">
                  Деактив.
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-surface rounded-t-3xl p-6 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новый сертификат</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <input type="number" placeholder="Номинал (₽)" value={nominal} onChange={e => setNominal(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-white text-xl font-bold" />
              <button onClick={() => create.mutate()} disabled={create.isPending || !nominal}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">
                Создать сертификат</button>
            </div>
          </div>
        </div>
      )}
    </ManageLayout>
  )
}
