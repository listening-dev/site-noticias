'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, LogOut, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  title?: string
}

export function Header({ title = 'Visão Geral' }: HeaderProps) {
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim()) {
      router.push(`/busca?q=${encodeURIComponent(search.trim())}`)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/cron/fetch-feeds', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}` },
      })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar notícias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64"
          />
        </form>

        <Button variant="ghost" size="icon" onClick={handleSync} disabled={syncing} title="Atualizar feeds">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </Button>

        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
