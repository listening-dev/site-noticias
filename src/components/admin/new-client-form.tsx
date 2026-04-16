'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

export function NewClientForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      router.push(`/admin/clientes/${data.id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar')
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-5 max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Descrição</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertCircle size={14} className="mt-0.5" /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Criar cliente
          </Button>
        </div>
      </form>
    </Card>
  )
}
