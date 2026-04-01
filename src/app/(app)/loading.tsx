import { Skeleton } from '@/components/ui/skeleton'

function NewsCardSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
          {/* Título */}
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4 mb-1" />
          {/* Descrição */}
          <Skeleton className="h-3 w-full mt-2" />
          <Skeleton className="h-3 w-5/6 mt-1" />
          {/* Data */}
          <div className="flex items-center gap-1 mt-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        {/* Botões */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Filtros skeleton */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <Skeleton className="h-3 w-12 mb-2" />
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-7 w-20" />
            ))}
          </div>
        </div>
      </div>

      {/* Grid de cards skeleton */}
      <div className="grid gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <NewsCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
