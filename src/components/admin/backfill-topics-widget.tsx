'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  initialTotal: number
  initialProcessed: number
}

export function BackfillTopicsWidget({ initialTotal, initialProcessed }: Props) {
  const [total] = useState(initialTotal)
  const [processed, setProcessed] = useState(initialProcessed)
  const [running, setRunning] = useState(false)
  const [autoLoop, setAutoLoop] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remaining = Math.max(0, total - processed)
  const coveragePct = total > 0 ? Math.round((processed / total) * 100) : 0

  async function runBatch() {
    setError(null)
    setRunning(true)
    try {
      const res = await fetch('/api/admin/backfill-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao processar')
      setProcessed(total - (data.remaining ?? 0))
      setLastResult(
        `Lote processado: ${data.succeeded ?? 0} sucesso, ${data.failed ?? 0} falhas. Restam ${data.remaining ?? 0}.`,
      )
      return data
    } catch (e: any) {
      setError(e?.message ?? 'Erro')
      throw e
    } finally {
      setRunning(false)
    }
  }

  async function runAutoLoop() {
    setAutoLoop(true)
    try {
      while (true) {
        const data = await runBatch()
        if (!data.remaining || data.remaining === 0) break
        if (data.failed && data.failed > data.succeeded) break
      }
    } catch {
      // error already set
    } finally {
      setAutoLoop(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain size={18} />
          Backfill de análise de sentimento (OpenAI)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-gray-900">{coveragePct}%</span>
            <span className="text-sm text-gray-500">
              {processed.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} notícias analisadas
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Restam <span className="font-semibold">{remaining.toLocaleString('pt-BR')}</span> notícias
            sem análise. Cada lote processa 100 notícias.
          </p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runBatch} disabled={running || autoLoop || remaining === 0}>
            {running && !autoLoop ? <Loader2 size={14} className="animate-spin" /> : null}
            Processar 1 lote (100)
          </Button>
          <Button size="sm" onClick={runAutoLoop} disabled={running || autoLoop || remaining === 0}>
            {autoLoop ? <Loader2 size={14} className="animate-spin" /> : null}
            Processar tudo em loop
          </Button>
        </div>

        {lastResult && (
          <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 rounded p-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            {lastResult}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded p-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          Rodar &quot;tudo em loop&quot; chama o endpoint repetidamente em lotes de 100 até completar.
          Requer API key OpenAI ativa. Custo estimado: ~$0.001 por notícia (gpt-4o-mini).
        </p>
      </CardContent>
    </Card>
  )
}
