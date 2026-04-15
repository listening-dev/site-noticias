'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Loader2 } from 'lucide-react'
import { Client } from '@/lib/types/database'

interface PeriodSelectorProps {
  from: string
  to: string
  clients?: Client[]
  selectedClientId?: string | null
}

const PRESETS = [
  { label: 'Últimas 24h', hours: 24 },
  { label: 'Últimos 7 dias', hours: 168 },
  { label: 'Últimos 30 dias', hours: 720 },
] as const

function toLocalDatetime(iso: string) {
  const d = new Date(iso)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function getActivePreset(from: string, to: string): number | null {
  const diffMs = new Date(to).getTime() - new Date(from).getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  for (const preset of PRESETS) {
    if (Math.abs(diffHours - preset.hours) <= 1) return preset.hours
  }
  return null
}

export function PeriodSelector({ from, to, clients, selectedClientId }: PeriodSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [customFrom, setCustomFrom] = useState(toLocalDatetime(from))
  const [customTo, setCustomTo] = useState(toLocalDatetime(to))

  const activePreset = getActivePreset(from, to)
  const showClients = clients && clients.length > 0

  function navigate(fromDate: Date, toDate: Date, clientId?: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', fromDate.toISOString())
    params.set('to', toDate.toISOString())
    params.delete('page')
    const cid = clientId !== undefined ? clientId : (selectedClientId ?? null)
    if (cid) {
      params.set('client', cid)
    } else {
      params.delete('client')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function setPreset(hours: number) {
    const now = new Date()
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000)
    navigate(start, now)
  }

  function applyCustomRange() {
    navigate(new Date(customFrom), new Date(customTo))
  }

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cid = e.target.value || null
    const params = new URLSearchParams(searchParams.toString())
    if (cid) {
      params.set('client', cid)
    } else {
      params.delete('client')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Cliente selector (only on report page) */}
        {showClients && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Cliente
            </label>
            <select
              value={selectedClientId ?? ''}
              onChange={handleClientChange}
              disabled={isPending}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todas as notícias</option>
              {clients!.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
        )}

        {/* Presets */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
            Período
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.hours}
                variant={activePreset === preset.hours ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPreset(preset.hours)}
                disabled={isPending}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {!showClients && isPending && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        {/* Custom range */}
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <input
            type="datetime-local"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isPending}
          />
          <span className="text-xs text-gray-400">até</span>
          <input
            type="datetime-local"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isPending}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={applyCustomRange}
            disabled={isPending}
          >
            Aplicar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
