import { cn } from '../lib/utils'

export interface LoadStateButtonProps {
  isLoading?: boolean
  progress?: number
  label?: string
  onClick?: () => void
}

const RING_RADIUS = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function PolymarketMark({ className }: { className?: string }) {
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

export function LoadStateButton({
  isLoading = false,
  progress,
  label = 'Connected',
  onClick,
}: LoadStateButtonProps) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress)
  const safeProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : 0
  const offset = RING_CIRCUMFERENCE * (1 - safeProgress / 100)
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'relative isolate inline-flex min-h-16 min-w-[224px] items-center gap-3 overflow-hidden rounded-2xl',
        'border border-white/10 bg-[#0f172a]/95 px-3.5 py-2.5 text-left text-white',
        'shadow-[0_18px_50px_rgba(2,6,23,0.22)] backdrop-blur-md',
        onClick && 'transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/30 active:scale-[0.99]',
      )}
      aria-busy={isLoading}
      aria-live="polite"
    >
      {isLoading && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 animate-pulse bg-[linear-gradient(105deg,transparent_10%,rgba(16,185,129,0.08)_48%,transparent_88%)]"
        />
      )}

      <span className="relative grid h-11 w-11 shrink-0 place-items-center">
        <svg
          viewBox="0 0 44 44"
          className={cn('absolute inset-0 h-11 w-11 -rotate-90', isLoading && !hasProgress && 'animate-spin')}
          aria-hidden="true"
        >
          <circle cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={hasProgress ? RING_CIRCUMFERENCE : `${RING_CIRCUMFERENCE * 0.28} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={hasProgress ? offset : 0}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        {hasProgress ? (
          <span className="text-[9px] font-bold tabular-nums text-white">{Math.round(safeProgress)}%</span>
        ) : (
          <PolymarketMark className="h-4 w-4 text-white" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight">{isLoading ? 'Syncing' : label}</span>
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {isLoading && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
          </span>
        </span>
        {isLoading && <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-400">{label}</span>}
      </span>
    </Component>
  )
}

export function PolyDeskLoadingState({
  label,
  fullScreen = false,
}: {
  label: string
  fullScreen?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        fullScreen ? 'min-h-[100dvh] bg-[#f7f7f9] px-5 dark:bg-[#111113]' : 'min-h-36 w-full py-8',
      )}
    >
      <LoadStateButton isLoading label={label} />
    </div>
  )
}
