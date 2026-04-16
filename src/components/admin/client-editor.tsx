'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { AlertCircle, Check, Loader2, Plus, RotateCcw } from 'lucide-react'
import { FilterEditor, FilterDraft } from './filter-editor'

interface Source {
  id: string
  name: string
  category?: string | null
}

interface UserOption {
  id: string
  name: string
  email?: string | null
  role?: string | null
}

interface Props {
  clientId: string
  initialName: string
  initialDescription: string | null
  initialFilters: FilterDraft[]
  initialSourceIds: string[]
  initialUserIds: string[]
  allSources: Source[]
  allUsers: UserOption[]
}

export function ClientEditor({
  clientId,
  initialName,
  initialDescription,
  initialFilters,
  initialSourceIds,
  initialUserIds,
  allSources,
  allUsers,
}: Props) {
  const router = useRouter()

  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [sourceIds, setSourceIds] = useState<string[]>(initialSourceIds)
  const [userIds, setUserIds] = useState<string[]>(initialUserIds)
  const [filters, setFilters] = useState<FilterDraft[]>(initialFilters)
  const [savingBasics, setSavingBasics] = useState(false)
  const [basicsError, setBasicsError] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)
  const [reprocessWindow, setReprocessWindow] = useState(30)

  const basicsDirty =
    name !== initialName ||
    (description || '') !== (initialDescription || '') ||
    !arraysEqual(sourceIds, initialSourceIds) ||
    !arraysEqual(userIds, initialUserIds)

  async function saveBasics() {
    setBasicsError(null)
    setSavingBasics(true)
    try {
      const res = await fetch(`/api/admin/clientes/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, sourceIds, userIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      router.refresh()
    } catch (e: any) {
      setBasicsError(e?.message ?? 'Erro ao salvar')
    } finally {
      setSavingBasics(false)
    }
  }

  async function reprocess() {
    setReprocessResult(null)
    setReprocessing(true)
    try {
      const res = await fetch(`/api/admin/clientes/${clientId}/reprocessar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowDays: reprocessWindow }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setReprocessResult(
        `Reprocessado: ${data.deleted} apagados, ${data.matched} novos matches em ${data.filters} filtros.`,
      )
      router.refresh()
    } catch (e: any) {
      setReprocessResult(`Erro: ${e?.message ?? 'falha no reprocesso'}`)
    } finally {
      setReprocessing(false)
    }
  }

  function handleFilterSaved(updated: FilterDraft, originalId?: string) {
    setFilters((prev) => {
      const idx = originalId
        ? prev.findIndex((f) => f.id === originalId)
        : prev.findIndex((f) => !f.id)
      if (idx === -1) return [...prev, updated]
      const copy = [...prev]
      copy[idx] = updated
      return copy
    })
  }

  function handleFilterDeleted(filterId: string) {
    setFilters((prev) => prev.filter((f) => f.id !== filterId))
  }

  function addDraftFilter() {
    setFilters((prev) => [...prev, { label: '', boolean_query: '', active: true }])
  }

  const sourcesByCategory = useMemo(() => {
    const map = new Map<string, Source[]>()
    for (const s of allSources) {
      const cat = s.category ?? 'Sem categoria'
      const arr = map.get(cat) ?? []
      arr.push(s)
      map.set(cat, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allSources])

  return (
    <div className="space-y-6">
      {/* Básico */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Dados do cliente</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Fontes vinculadas */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Fontes vinculadas ({sourceIds.length})
          </h3>
          <span className="text-xs text-gray-500">
            Vazio = booleana busca em todas as fontes
          </span>
        </div>
        <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
          {sourcesByCategory.map(([cat, sources]) => (
            <div key={cat}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                {cat}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {sources.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={sourceIds.includes(s.id)}
                      onChange={(e) => {
                        setSourceIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                        )
                      }}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Usuários vinculados */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Usuários com acesso ({userIds.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-2">
          {allUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={userIds.includes(u.id)}
                onChange={(e) => {
                  setUserIds((prev) =>
                    e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                  )
                }}
              />
              <span>{u.name}</span>
              {u.role && (
                <Badge variant="secondary" className="text-[10px]">
                  {u.role}
                </Badge>
              )}
            </label>
          ))}
          {allUsers.length === 0 && (
            <p className="text-xs text-gray-400 col-span-full">Nenhum usuário cadastrado.</p>
          )}
        </div>
      </Card>

      {basicsError && (
        <div className="flex items-start gap-2 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5" /> {basicsError}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={saveBasics} disabled={!basicsDirty || savingBasics}>
          {savingBasics ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Salvar dados e vínculos
        </Button>
      </div>

      {/* Filtros booleanos */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Filtros booleanos ({filters.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Notícia entra na aba do cliente se matchar ≥1 filtro ativo
              {sourceIds.length > 0 ? ' e vier de uma fonte vinculada' : ''}.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addDraftFilter}>
            <Plus size={14} /> Novo filtro
          </Button>
        </div>

        <div className="space-y-3">
          {filters.map((f, i) => (
            <FilterEditor
              key={f.id ?? `draft-${i}`}
              initial={f}
              clientId={clientId}
              linkedSourceIds={sourceIds.length > 0 ? sourceIds : null}
              onSaved={(saved) => handleFilterSaved(saved, f.id)}
              onDeleted={handleFilterDeleted}
            />
          ))}
          {filters.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum filtro cadastrado. Clique em "Novo filtro" para adicionar.
            </p>
          )}
        </div>
      </Card>

      {/* Reprocesso */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Reprocessar matches</h3>
        <p className="text-xs text-gray-500 mb-3">
          Apaga e recalcula todos os matches deste cliente dentro da janela. Use após editar
          booleanas ou fontes vinculadas.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={reprocessWindow}
            onChange={(e) => setReprocessWindow(Number(e.target.value))}
            className="h-9 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
          </select>
          <Button variant="outline" onClick={reprocess} disabled={reprocessing}>
            {reprocessing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Reprocessar
          </Button>
          {reprocessResult && (
            <span className="text-xs text-gray-600 ml-2">{reprocessResult}</span>
          )}
        </div>
      </Card>
    </div>
  )
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((x) => setA.has(x))
}
