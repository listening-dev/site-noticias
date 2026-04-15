import { Skeleton } from '@/components/ui/skeleton'

export default function RelatorioLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60 mt-2" />
      </div>

      {/* Period selector */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24 mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <Skeleton className="h-5 w-48 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <Skeleton className="h-5 w-52 mb-4" />
        <Skeleton className="h-[250px] w-full" />
      </div>

      {/* AI section */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mt-2" />
      </div>
    </div>
  )
}
