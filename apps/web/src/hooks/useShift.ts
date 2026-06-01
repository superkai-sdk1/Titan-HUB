'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useCurrentShift() {
  return useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: () => api.get<{ shift: any }>('/shifts/current').then(r => r.shift),
    refetchInterval: 30000,
  })
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { cashStart: number; eveningType: string; note?: string; adjustmentReason?: string }) =>
      api.post<{ shift: any }>('/shifts/open', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { cashEnd: number; adjustmentReason?: string }) => api.post<{ shift: any; analytics: any }>('/shifts/close', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}
