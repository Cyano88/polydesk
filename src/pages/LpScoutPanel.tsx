import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, LineChart, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import AgentWorkspace from './AgentWorkspace'

const POLYMARKET_LOGO = '/brand/polymarket-logo.png'

export type LpScoutMode = 'best' | 'theme' | 'market'

export type LpScoutPrefill = {
  mode: LpScoutMode
  query: string
  budget?: string
}

type LpScoutPath = 'access' | 'fund'
type LpScoutStep = 'service' | 'agent'

export type LpScoutOption = {
  id: LpScoutMode
  title: string
  body: string
  amount: string
  icon: LucideIcon
  inputLabel?: string
  inputPlaceholder?: string
}

export const lpScoutOptions: LpScoutOption[] = [
  {
    id: 'best',
    title: 'Best reward markets',
    body: 'Rank live reward markets by spread, depth and risk.',
    amount: '0.01',
    icon: LineChart,
  },
  {
    id: 'theme',
    title: 'Scout a theme',
    body: 'Scan one sector, event or football category.',
    amount: '0.01',
    icon: Sparkles,
    inputLabel: 'Theme',
    inputPlaceholder: 'crypto, AI, election, football...',
  },
  {
    id: 'market',
    title: 'Inspect one market',
    body: 'Inspect one market book and its LP risk.',
    amount: '0.01',
    icon: ExternalLink,
    inputLabel: 'Market URL or slug',
    inputPlaceholder: 'https://polymarket.com/event/...',
  },
]

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <span className="back-btn" aria-hidden="true">
        <span className="arrow-container">
          <span className="chevron c1" />
          <span className="chevron c2" />
          <span className="chevron c3" />
        </span>
      </span>
      Back
    </button>
  )
}

function InputBlock({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
      />
    </label>
  )
}

export function LpScoutPanel({
  prefill,
  onPrefillConsumed,
  onBack,
  onOpenFootball,
  hideBack = false,
}: {
  prefill: LpScoutPrefill | null
  onPrefillConsumed: () => void
  onBack: () => void
  onOpenFootball?: () => void
  hideBack?: boolean
}) {
  const [searchParams] = useSearchParams()
  const initialPath = searchParams.get('lpScoutPath') === 'fund' ? 'fund' : 'access'
  const [path, setPath] = useState<LpScoutPath>(initialPath)
  const [step, setStep] = useState<LpScoutStep>('service')
  const [mode, setMode] = useState<LpScoutMode>('best')
  const [query, setQuery] = useState('')
  const [maxSpend, setMaxSpend] = useState(lpScoutOptions[0].amount)
  const [prefillNotice, setPrefillNotice] = useState('')
  const selectedOption = lpScoutOptions.find(option => option.id === mode) ?? lpScoutOptions[0]
  const canChooseAgent = !selectedOption.inputLabel || query.trim().length > 2

  useEffect(() => {
    if (searchParams.get('lpScoutPath') === 'fund') {
      setPath('fund')
      setStep('agent')
    }
  }, [searchParams])

  useEffect(() => {
    if (!prefill) return
    const option = lpScoutOptions.find(item => item.id === prefill.mode) ?? lpScoutOptions[0]
    setPath('access')
    setStep('service')
    setMode(option.id)
    setQuery(prefill.query)
    setMaxSpend(option.amount)
    setPrefillNotice(prefill.query)
    onPrefillConsumed()
  }, [onPrefillConsumed, prefill])

  function selectOption(option: LpScoutOption) {
    setMode(option.id)
    setMaxSpend(option.amount)
    setQuery('')
    setPrefillNotice('')
    setStep('service')
  }

  function backFromPath() {
    if (path === 'fund') return onBack()
    if (step === 'agent') return setStep('service')
    onBack()
  }

  const walletRequestParams = path === 'fund'
    ? {
        profile: 'agent',
        walletManager: 'service',
        src: 'lp-scout',
        n: 'arc',
      }
    : {
        profile: 'agent',
        walletManager: 'service',
        src: 'lp-scout',
        run: 'polymarket-scout',
        scoutMode: selectedOption.id,
        maxAmount: maxSpend.trim(),
        serviceUrl: '/api/x402/polymarket-scout',
        n: 'arc',
        context: query.trim() || undefined,
      }

  if (path === 'fund') {
    return (
      <div className="mt-4 space-y-4">
        {!hideBack && <BackButton onClick={backFromPath} />}
        <AgentWorkspace embedded forceProfile requestParams={walletRequestParams} />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {!hideBack && <BackButton onClick={backFromPath} />}

      {step !== 'agent' && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                Choose a scout, set a max spend, then pay with x402.
              </h2>
            </div>
            {onOpenFootball && (
              <button
                type="button"
                onClick={onOpenFootball}
                className="shrink-0 text-xs font-semibold text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Football markets
              </button>
            )}
          </div>

          <div className="grid gap-2">
            {lpScoutOptions.map(option => {
              const Icon = option.icon
              const selected = option.id === mode
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectOption(option)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left transition-all active:scale-[0.99] dark:bg-white/[0.05]',
                    selected
                      ? 'border-gray-950 ring-2 ring-gray-950/10 dark:border-white dark:ring-white/15'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.08]',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{option.title}</span>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                        max {option.amount} USDC
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{option.body}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="polydesk-card space-y-3 p-4">
            {prefillNotice && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-200">News context loaded</p>
                <p className="mt-0.5 truncate text-xs font-medium text-emerald-800/80 dark:text-emerald-100/80">{prefillNotice}</p>
              </div>
            )}
            {selectedOption.inputLabel && (
              <InputBlock
                label={selectedOption.inputLabel}
                value={query}
                onChange={value => {
                  setQuery(value)
                  if (prefillNotice) setPrefillNotice('')
                }}
                placeholder={selectedOption.inputPlaceholder ?? 'Add context'}
              />
            )}
            <button
              type="button"
              onClick={() => setStep('agent')}
              disabled={!canChooseAgent}
              className="polydesk-primary-cta w-full"
            >
              <Wallet className="h-4 w-4" />
              Continue to LP Scout checkout
            </button>
          </div>
        </>
      )}

      {step === 'agent' && (
        <div className="animate-slide-up">
          <AgentWorkspace embedded forceProfile requestParams={walletRequestParams} />
        </div>
      )}
    </div>
  )
}
