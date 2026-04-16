'use client'

import { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'

interface RelativeTimeProps {
  date: string | null
  className?: string
}

/**
 * RelativeTime: Renders relative time (e.g., "há 2 minutos") client-side only
 *
 * Why: Server-side calculation leads to hydration mismatch because time changes
 * between server render and client hydration (even milliseconds apart).
 *
 * Solution: Calculate only on client with useEffect, suppress hydration warning
 * during initial render (shows placeholder).
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [mounted, setMounted] = useState(false)
  const [relativeTime, setRelativeTime] = useState('')

  useEffect(() => {
    if (date) {
      setRelativeTime(formatRelativeTime(date))
      setMounted(true)
    }
  }, [date])

  // During hydration, show empty (suppressHydrationWarning handles mismatch)
  // After mount, show calculated relative time
  if (!mounted) {
    return <span className={className} suppressHydrationWarning></span>
  }

  return <span className={className}>{relativeTime}</span>
}
