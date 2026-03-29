'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const CLIENTS = ['AXIS','BETS','DIGT','DOMS','FRTC','GTMS','INPE','LDEM','NEBE','NELA','OGNO','PESC','PROL','QULF','REMR','SECX']
const STATUSES = ['ACTIVE','PAUSED','DRAFT','COMPLETED','ARCHIVED']
const HEALTH = ['HEALTHY','WARNING','CRITICAL','UNKNOWN']

export default function FilterBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const clientFilter = searchParams.get('client') || ''
  const statusFilter = searchParams.get('status') || ''
  const healthFilter = searchParams.get('health') || ''

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`/campaigns?${params.toString()}`)
    })
  }

  const hasFilter = clientFilter || statusFilter || healthFilter

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Client</label>
        <select
          value={clientFilter}
          onChange={(e) => updateParam('client', e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All clients</option>
          {CLIENTS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
        <select
          value={statusFilter}
          onChange={(e) => updateParam('status', e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Health</label>
        <select
          value={healthFilter}
          onChange={(e) => updateParam('health', e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All health</option>
          {HEALTH.map((h) => (
            <option key={h} value={h}>{h.charAt(0) + h.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>
      {hasFilter && (
        <button
          type="button"
          onClick={() => startTransition(() => router.push('/campaigns'))}
          className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      )}
    </div>
  )
}
