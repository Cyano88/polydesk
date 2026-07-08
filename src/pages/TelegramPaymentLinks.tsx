import { ChevronRight, LineChart, Newspaper, Radio, Search, Trophy, Wallet } from 'lucide-react'

export type LpScoutPrefill = {
  market?: string
  question?: string
  url?: string
}

type BackProps = {
  onBack?: () => void
}

export function TelegramHelperPanel({
  welcomeText,
  inputPlaceholder,
  initialPolyDeskSubMode,
  onPolyDeskSubModeChange,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  fallbackOwner: string
  initialEventId: string
  initialPayer: string
  initialHelperMode: string
  initialPolyDeskSubMode: 'portfolio' | 'worldcup' | 'lp-scout' | ''
  initialNotice: string
  lockedHelperMode: string
  welcomeText: string
  inputPlaceholder: string
  hideTopDivider?: boolean
  polyDeskResetSignal: number
  onPolyDeskSubModeChange: (mode: 'portfolio' | 'worldcup' | 'lp-scout' | '') => void
  onRecoverTelegramName: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
        <p className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">{welcomeText}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['portfolio', 'worldcup', 'lp-scout'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => onPolyDeskSubModeChange(mode)}
            className={[
              'min-h-10 rounded-xl border px-2 text-xs font-bold capitalize transition-colors',
              initialPolyDeskSubMode === mode
                ? 'border-[#0071E3] bg-[#0071E3] text-white'
                : 'border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200',
            ].join(' ')}
          >
            {mode.replace('-', ' ')}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
        {inputPlaceholder}
      </div>
    </div>
  )
}

export function PolyPortfolioPanel({
  onBack,
  onOpenLpScout,
  onOpenWorldCup,
}: BackProps & {
  onOpenLpScout: () => void
  onOpenWorldCup: () => void
  telegramOwner: string
  telegramId: string
  surface: string
  initialPortfolioAction: 'trading' | null
  initialTradingWalletTab?: 'balance'
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
      <PanelTop icon={Wallet} kicker="Balance" title="Main Wallet" onBack={onBack} />
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
        View pUSD trading cash, fund your account, withdraw as USDC, and track positions.
      </p>
      <div className="mt-4 grid gap-3">
        <Metric label="pUSD trading cash" value="$--" note="Live balance moves when the production portfolio panel is extracted." />
        <Metric label="Portfolio value" value="$--" note="$0.00 active positions" />
        <Metric label="Claimable" value="$--" note="Redeemable positions" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-xl bg-[#0071E3] px-4 py-2 text-sm font-bold text-white" type="button">
          Balance
        </button>
        <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700" type="button">
          Fund
        </button>
        <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700" type="button">
          Withdraw
        </button>
        <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700" type="button">
          Positions
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        <ServiceButton label="World Cup" icon={Trophy} onClick={onOpenWorldCup} />
        <ServiceButton label="LP Scout" icon={Search} onClick={onOpenLpScout} />
      </div>
    </section>
  )
}

export function PolyWorldCupHubPanel({
  onBack,
  onOpenNews,
  onOpenScores,
  onOpenPortfolio,
}: BackProps & {
  onOpenNews: () => void
  onOpenScores: () => void
  onOpenPortfolio: () => void
}) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Trophy} kicker="World Cup" title="Market hub" onBack={onBack} />
      <ServiceButton label="Scores" icon={Radio} onClick={onOpenScores} />
      <ServiceButton label="News" icon={Newspaper} onClick={onOpenNews} />
      <ServiceButton label="Portfolio" icon={Wallet} onClick={onOpenPortfolio} />
    </div>
  )
}

export function PolyWorldCupNewsPanel({
  onBack,
  onOpenScores,
  onOpenLpScout,
}: BackProps & {
  onOpenScores: () => void
  onOpenLpScout: (prefill: LpScoutPrefill) => void
}) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Newspaper} kicker="World Cup" title="News" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production news feed is a Phase 2 panel extraction target.
      </p>
      <ServiceButton label="Scores" icon={Radio} onClick={onOpenScores} />
      <ServiceButton label="Send to LP Scout" icon={Search} onClick={() => onOpenLpScout({ market: 'World Cup' })} />
    </div>
  )
}

export function PolyStreamPanel({ onBack, onOpenNews }: BackProps & { onOpenNews: () => void }) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Radio} kicker="Live" title="Scores" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production PolyStream fixture and market matching is a Phase 2 panel extraction target.
      </p>
      <ServiceButton label="News" icon={Newspaper} onClick={onOpenNews} />
    </div>
  )
}

export function LpScoutPanel({
  prefill,
  onBack,
}: BackProps & {
  prefill: LpScoutPrefill | null
  onPrefillConsumed: () => void
  onOpenWalletManager: () => void
}) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Search} kicker="LP Scout" title="Scout" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production LP Scout extraction target. {prefill?.market ? `Prefill: ${prefill.market}` : ''}
      </p>
      <ServiceButton label="Reward intelligence" icon={LineChart} onClick={() => undefined} />
    </div>
  )
}

function PanelTop({
  icon: Icon,
  kicker,
  title,
  onBack,
}: {
  icon: typeof Wallet
  kicker: string
  title: string
  onBack?: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600">
          Back
        </button>
      )}
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0071E3]">
        <Icon size={20} />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{kicker}</p>
        <h2 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">{title}</h2>
      </div>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-bold text-gray-400">{label}</p>
      <strong className="mt-1 block text-2xl font-black text-gray-900 dark:text-white">{value}</strong>
      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{note}</span>
    </div>
  )
}

function ServiceButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Wallet; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:border-gray-200 hover:shadow-lg dark:border-white/10 dark:bg-[#111114]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0071E3]">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-black text-gray-900 dark:text-white">{label}</span>
      <ChevronRight size={18} className="text-gray-400" />
    </button>
  )
}
