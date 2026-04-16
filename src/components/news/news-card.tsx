'use client'

import { useState } from 'react'
import { ExternalLink, Star, CheckCheck, Clock, Loader2, Filter } from 'lucide-react'
import { News, Source } from '@/lib/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { truncate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { RelativeTime } from '@/components/relative-time'

interface NewsCardProps {
  news: News & { sources?: Source }
  isFavorited?: boolean
  isRead?: boolean
  keywords?: string[]
  matchedFilter?: { label: string | null; boolean_query: string } | null
}

export function NewsCard({ news, isFavorited = false, isRead = false, keywords = [], matchedFilter = null }: NewsCardProps) {
  const [favorited, setFavorited] = useState(isFavorited)
  const [read, setRead] = useState(isRead)
  const [isSavingFavorite, setIsSavingFavorite] = useState(false)
  const [isSavingRead, setIsSavingRead] = useState(false)
  const supabase = createClient()

  async function toggleFavorite() {
    if (isSavingFavorite) return
    setIsSavingFavorite(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (favorited) {
        await supabase.schema('noticias').from('user_favorites').delete()
          .eq('user_id', user.id).eq('news_id', news.id)
      } else {
        await supabase.schema('noticias').from('user_favorites').insert({ user_id: user.id, news_id: news.id })
      }
      setFavorited(!favorited)
    } finally {
      setIsSavingFavorite(false)
    }
  }

  async function markAsRead() {
    if (read || isSavingRead) return
    setIsSavingRead(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.schema('noticias').from('user_read_news').upsert({ user_id: user.id, news_id: news.id })
      setRead(true)
    } finally {
      setIsSavingRead(false)
    }
  }

  function highlightKeywords(text: string): string {
    if (!keywords.length) return text
    const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.replace(pattern, '<mark class="keyword-highlight">$1</mark>')
  }

  const title = highlightKeywords(news.title)
  const description = news.description ? highlightKeywords(truncate(news.description, 200)) : null

  return (
    <article
      className={`news-card-enter rounded-lg border bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md ${read ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Fonte e categoria */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {news.sources && (
              <Badge variant="secondary" className="text-xs">{news.sources.name}</Badge>
            )}
            {news.category && (
              <Badge variant="outline" className="text-xs capitalize">{news.category}</Badge>
            )}
            {read && <Badge variant="outline" className="text-xs text-gray-400">Lida</Badge>}
          </div>

          {/* Título */}
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markAsRead}
            className="block text-sm font-semibold text-gray-900 hover:text-blue-600 leading-snug mb-1 transition-colors duration-200"
            dangerouslySetInnerHTML={{ __html: title }}
          />

          {/* Descrição */}
          {description && (
            <p
              className="text-xs text-gray-500 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          )}

          {/* Data + filtro que casou */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              <RelativeTime date={news.published_at} />
            </span>
            {matchedFilter && (
              <span
                className="flex items-center gap-1 text-blue-600"
                title={`Casou com: ${matchedFilter.boolean_query}`}
              >
                <Filter size={11} />
                Filtro: {matchedFilter.label || 'sem label'}
              </span>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFavorite}
            disabled={isSavingFavorite}
            title={favorited ? 'Remover favorito' : 'Favoritar'}
            className={isSavingFavorite ? 'opacity-50 cursor-wait' : ''}
          >
            {isSavingFavorite
              ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              : <Star className={`h-4 w-4 ${favorited ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={markAsRead}
            disabled={isSavingRead || read}
            title="Marcar como lida"
            className={isSavingRead ? 'opacity-50 cursor-wait' : ''}
          >
            {isSavingRead
              ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              : <CheckCheck className={`h-4 w-4 ${read ? 'text-blue-500' : 'text-gray-400'}`} />
            }
          </Button>
          <a href={news.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon" title="Abrir notícia">
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </Button>
          </a>
        </div>
      </div>
    </article>
  )
}
