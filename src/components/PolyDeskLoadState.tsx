import { cn } from '../lib/utils'

export function PolymarketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M6.25 5.8 18.4 2.75a1 1 0 0 1 1.24.97v16.56a1 1 0 0 1-1.24.97L6.25 18.2a1 1 0 0 1-.75-.97V6.77a1 1 0 0 1 .75-.97Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M7.2 8.45 17.2 5.9v5.35L7.2 8.45ZM7.2 15.55l10-2.8v5.35l-10-2.55Z" fill="currentColor" />
    </svg>
  )
}

function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-md bg-gray-200/90 dark:bg-slate-800/70',
        className,
      )}
    />
  )
}

function MarketCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-[#11141b]">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid grid-cols-[1fr_64px_64px] gap-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}

function HeaderSkeleton() {
  return (
    <header className="border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-[#0b0e14]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-bold tracking-tight">
          <PolymarketMark className="h-5 w-5" />
          PolyDesk
        </span>
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
    </header>
  )
}

export function PolyDeskLoadingState({
  label,
  fullScreen = false,
}: {
  label: string
  fullScreen?: boolean
}) {
  if (fullScreen) {
    return (
      <main
        className="min-h-[100dvh] bg-gray-50 text-gray-900 dark:bg-[#0b0e14] dark:text-slate-100"
        aria-busy="true"
        aria-label={label}
      >
        <HeaderSkeleton />
        <section className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-9">
          <div className="flex items-center gap-2 overflow-hidden pb-5">
            <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
            <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
            <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
            <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MarketCardSkeleton rows={2} />
            <MarketCardSkeleton rows={3} />
            <MarketCardSkeleton rows={2} />
            <MarketCardSkeleton rows={2} />
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="grid w-full gap-3 py-2" aria-busy="true" aria-label={label}>
      <MarketCardSkeleton rows={2} />
      <MarketCardSkeleton rows={1} />
    </div>
  )
}
