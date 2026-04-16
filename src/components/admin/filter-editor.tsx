'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Check, Loader2, Trash2 } from 'lucide-react'

export interface FilterDraft {
  id?: string
  label: string
  boolean_query: string
  active: boolean
}

export interface PreviewResult {
  ok: boolean
  total?: number
  sample?: Array<{ id: string; title: string; url: string; published_at: string; source_name: string | null }>
  tsquery?: string
  error?: string
  warning?: string
}

interface Props {
  initial: FilterDraft
  clientId: string
  linkedSourceIds: string[] | null
  onSaved: (filter: FilterDraft) => void
  onDeleted?: (filterId: string) => void
}

export function FilterEditor({ initial, clientId, linkedSourceIds, onSaved, onDeleted }: Props) {
  const [draft, setDraft] = useState<FilterDraft>(initial)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  useEffect(() => {
    if (!draft.boolean_query.trim()) {
      setPreview(null)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runPreview(), 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [draft.boolean_query, linkedSourceIds?.join(',')])

  async function runPreview() {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPreviewing(true)

    try {
      const res = await fetch('/api/admin/filters/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booleanQuery: draft.boolean_query,
          sourceIds: linkedSourceIds,
          windowDays: 30,
        }),
        signal: ac.signal,
      })
      const data = (await res.json()) as PreviewResult
      setPreview(data)
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setPreview({ ok: false, error: String(e?.message ?? e) })
      }
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    setSaveError(null)
    setSaving(true)
    try {
      const url = draft.id
        ? `/api/admin/filtros/${draft.id}`
        : `/api/admin/clientes/${clientId}/filtros`
      const method = draft.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: draft.label || null,
          boolean_query: draft.boolean_query,
          active: draft.active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      const saved = { ...draft, id: draft.id ?? data.id }
      onSaved(saved)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!draft.id) return
    if (!confirm('Remover este filtro? Os matches associados serão apagados.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/filtros/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro')
      }
      onDeleted?.(draft.id)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Erro ao apagar')
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Label (ex: Termos centrais, Crises, Lideranças...)"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            className="flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Ativo
          </label>
        </div>

        <textarea
          placeholder={`Booleana. Ex: "Reforma Agrária" OR Pronaf OR MST`}
          value={draft.boolean_query}
          onChange={(e) => setDraft({ ...draft, boolean_query: e.target.value })}
          className="w-full min-h-[72px] rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Preview */}
        <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Preview (últimos 30 dias{linkedSourceIds && linkedSourceIds.length > 0
                ? `, ${linkedSourceIds.length} fontes`
                : ', todas as fontes'})
            </span>
            {previewing && <Loader2 size={14} className="animate-spin text-blue-500" />}
          </div>

          {!draft.boolean_query.trim() && (
            <p className="text-xs text-gray-400">Digite uma booleana para ver o preview.</p>
          )}

          {preview && !preview.ok && (
            <div className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{preview.error}</span>
            </div>
          )}

          {preview && preview.ok && (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-bold text-gray-900">{preview.total ?? 0}</span>
                <span className="text-xs text-gray-500">matches nos últimos 30 dias</span>
              </div>
              {preview.warning && (
                <p className="text-xs text-amber-700 mb-2">{preview.warning}</p>
              )}
              {preview.sample && preview.sample.length > 0 && (
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {preview.sample.map((n) => (
                    <li key={n.id} className="text-xs leading-snug">
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-700 hover:text-blue-600 hover:underline line-clamp-1"
                      >
                        {n.title}
                      </a>
                      <span className="text-gray-400 ml-1">
                        — {n.source_name ?? 'sem fonte'} ·{' '}
                        {new Date(n.published_at).toLocaleDateString('pt-BR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {saveError && (
          <div className="flex items-start gap-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5" /> {saveError}
          </div>
        )}

        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {draft.id ? (
              <Badge variant="secondary" className="text-xs">Salvo</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                Rascunho — não salvo
              </Badge>
            )}
            {isDirty && draft.id && (
              <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                Alterações pendentes
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {draft.id && onDeleted && (
              <Button variant="outline" size="sm" onClick={handleDelete} disabled={saving}>
                <Trash2 size={14} /> Apagar
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !draft.boolean_query.trim() || (!isDirty && !!draft.id)}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {draft.id ? 'Salvar alterações' : 'Salvar filtro'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
