import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, ExternalLink, LineChart, Newspaper, Trophy, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import AgentWorkspace from './AgentWorkspace'

export type LpScoutMode = 'best' | 'news' | 'market' | 'football'

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
    title: 'Best markets',
    body: 'Rank live reward markets by spread, depth, time and risk.',
    amount: '0.01',
    icon: LineChart,
  },
  {
    id: 'news',
    title: 'News markets',
    body: 'Match a news topic against active markets and their live books.',
    amount: '0.01',
    icon: Newspaper,
    inputLabel: 'News topic',
    inputPlaceholder: 'Election, regulation, company or event...',
  },
  {
    id: 'market',
    title: 'Inspect market',
    body: 'Inspect one exact market, its live book and LP risk.',
    amount: '0.01',
    icon: ExternalLink,
    inputLabel: 'Market URL or slug',
    inputPlaceholder: 'https://polymarket.com/event/...',
  },
  {
    id: 'football',
    title: 'Football markets',
    body: 'Cross-check verified fixture context with matched Polymarket books.',
    amount: '0.01',
    icon: Trophy,
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
  hideBack = false,
}: {
  prefill: LpScoutPrefill | null
  onPrefillConsumed: () => void
  onBack: () => void
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
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">LP Scout</h1>
            <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
              Live market context for safer maker-order decisions.
            </p>
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
                  aria-pressed={selected}
                  className={cn(
                    'polydesk-card relative flex w-full items-start gap-3 p-4 text-left transition-all active:scale-[0.99]',
                    selected
                      ? '!border-2 !border-gray-950 !bg-gray-50 shadow-sm dark:!border-white dark:!bg-white/[0.08]'
                      : 'hover:border-gray-300 dark:hover:border-white/20',
                  )}
                >
                  <Icon className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    selected ? 'text-gray-950 dark:text-white' : 'text-gray-400',
                  )} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-950 dark:text-white">{option.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{option.body}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 pt-0.5">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{option.amount} USDC</span>
                    {selected && <Check className="h-4 w-4 text-gray-950 dark:text-white" aria-hidden="true" />}
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
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
