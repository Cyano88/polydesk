import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLongRightIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  CircleStackIcon,
  CommandLineIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import PolymarketMark from '../components/PolymarketMark'
import './about.css'

type InfrastructureKey = 'polymarket' | 'sportmonks' | 'zeroscout' | 'hashpaylink' | 'okx' | 'xlayer'

const infrastructure: Record<InfrastructureKey, { name: string; role: string; href: string; logo: string }> = {
  polymarket: {
    name: 'Polymarket',
    role: 'Markets and order books',
    href: 'https://polymarket.com',
    logo: '/brand/polymarket-logo.png',
  },
  sportmonks: {
    name: 'Sportmonks',
    role: 'Football data provider',
    href: 'https://www.sportmonks.com/football-api/',
    logo: '/brand/sportmonks-logo.png',
  },
  zeroscout: {
    name: 'ZeroScout',
    role: 'Intelligence layer',
    href: 'https://zeroscout.app',
    logo: '/zeroscout-mark.png',
  },
  hashpaylink: {
    name: 'Hash PayLink',
    role: 'Funding checkout and receipts',
    href: 'https://hashpaylink.com',
    logo: '/brand/hashpaylink-mark.png',
  },
  okx: {
    name: 'OKX.AI',
    role: 'Agent discovery and distribution',
    href: 'https://web3.okx.com/onchainos/dev-docs/okxai/what-is-okxai',
    logo: '/brand/okx-ai-logo.png',
  },
  xlayer: {
    name: 'X Layer',
    role: 'Service payment settlement',
    href: 'https://www.okx.com/xlayer',
    logo: '/brand/x-layer-logo.png',
  },
}

const scenes = [
  {
    id: 'discover',
    index: '01',
    label: 'Market intelligence',
    title: 'Find the market worth your next move.',
    body: 'Pulse ranks live markets. Watch reads public positions. LP Scout reviews spread, depth, rewards, freshness, and execution risk. Sportmonks football data and ZeroScout intelligence add source-backed context.',
    image: '/about/pulse.png',
    imageClass: 'about-crop-pulse',
    alt: 'PolyDesk Pulse ranking a current Polymarket opportunity',
    overlay: 'Live markets, ranked.',
    infrastructure: ['polymarket', 'sportmonks', 'zeroscout'] as InfrastructureKey[],
    points: [
      [ChartBarIcon, 'Pulse ranks current market and reward conditions'],
      [BoltIcon, 'Watch and LP Scout turn public data into a next step'],
      [CircleStackIcon, 'Football scores and news remain source-backed'],
    ],
    action: 'Open live Pulse',
    href: '/polydesk?service=pulse',
  },
  {
    id: 'govern',
    index: '02',
    label: 'Buyer-controlled execution',
    title: 'One trade. Your limits. Your signature.',
    body: 'Start with a public watched wallet or one exact BUY. PolyDesk verifies the owner-derived Deposit Wallet, checks written spend, market, price, and expiry limits, then returns FUND, APPROVE, or SIGN.',
    image: '/about/trading-membership.png',
    imageClass: 'about-crop-govern',
    alt: 'PolyDesk Trading Membership showing a buyer-controlled trading mission',
    overlay: 'Bounded before it moves.',
    infrastructure: ['polymarket', 'hashpaylink'] as InfrastructureKey[],
    points: [
      [KeyIcon, 'The buyer keeps every wallet key and signature'],
      [CheckBadgeIcon, 'Verified Funding matches owner and Deposit Wallet'],
      [CommandLineIcon, 'Governed Trader returns public execution proof'],
    ],
    action: 'Read the trading guide',
    href: '/docs/okx-ai',
  },
]

const infrastructureOrder: InfrastructureKey[] = ['polymarket', 'sportmonks', 'zeroscout', 'hashpaylink', 'okx', 'xlayer']

function InfrastructureBadges({ items }: { items: InfrastructureKey[] }) {
  return (
    <div className="about-inline-infrastructure" aria-label="Infrastructure used in this flow">
      {items.map(key => {
        const item = infrastructure[key]
        return (
          <span key={key} className={`about-inline-brand about-inline-brand--${key}`}>
            <img src={item.logo} alt="" aria-hidden="true" />
            <span className="about-inline-brand-copy">
              <span className="about-inline-brand-name">{item.name}</span>
              <span className="about-inline-brand-role">{item.role}</span>
            </span>
          </span>
        )
      })}
    </div>
  )
}

export default function About() {
  const shellRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    shell.scrollTop = 0
    window.scrollTo(0, 0)
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const sections = Array.from(shell.querySelectorAll<HTMLElement>('.about-snap-section'))
    sections[0]?.classList.add('is-section-active')

    const scrollStops = [...sections, shell.querySelector<HTMLElement>('[data-about-scroll-stop="true"]')].filter(
      (item): item is HTMLElement => Boolean(item),
    )
    const deckMedia = window.matchMedia('(min-width: 1024px) and (min-height: 700px)')
    let wheelLocked = false
    let wheelTimer = 0

    const nearestStopIndex = () => {
      const maximumScroll = shell.scrollHeight - shell.clientHeight
      return scrollStops.reduce((closestIndex, stop, index) => {
        const closestTop = Math.min(scrollStops[closestIndex].offsetTop, maximumScroll)
        const stopTop = Math.min(stop.offsetTop, maximumScroll)
        return Math.abs(stopTop - shell.scrollTop) < Math.abs(closestTop - shell.scrollTop) ? index : closestIndex
      }, 0)
    }

    const handleWheel = (event: WheelEvent) => {
      if (!deckMedia.matches || event.ctrlKey || Math.abs(event.deltaY) < 8 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      event.preventDefault()
      if (wheelLocked) return

      const currentIndex = nearestStopIndex()
      const targetIndex = Math.max(0, Math.min(currentIndex + (event.deltaY > 0 ? 1 : -1), scrollStops.length - 1))
      if (targetIndex === currentIndex) return

      wheelLocked = true
      const maximumScroll = shell.scrollHeight - shell.clientHeight
      shell.scrollTo({ top: Math.min(scrollStops[targetIndex].offsetTop, maximumScroll), behavior: 'smooth' })
      sections.forEach((section, index) => section.classList.toggle('is-section-active', index === targetIndex))
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        wheelLocked = false
      }, 760)
    }

    const handleAnchorClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      if (!link || !shell.contains(link)) return
      const targetId = link.getAttribute('href')
      const target = targetId ? shell.querySelector<HTMLElement>(targetId) : null
      if (!target) return
      event.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.replaceState(null, '', targetId)
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add('is-section-active')
        })
      },
      { root: shell, threshold: 0.28, rootMargin: '-8% 0px -8% 0px' },
    )

    sections.forEach(section => observer.observe(section))
    shell.addEventListener('wheel', handleWheel, { passive: false })
    shell.addEventListener('click', handleAnchorClick)

    return () => {
      observer.disconnect()
      shell.removeEventListener('wheel', handleWheel)
      shell.removeEventListener('click', handleAnchorClick)
      window.clearTimeout(wheelTimer)
    }
  }, [])

  return (
    <main ref={shellRef} className="about-snap-shell font-inter text-slate-950">
      <header className="about-header">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <PolymarketMark className="h-6 w-6" />
            PolyDesk
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/docs" className="hidden text-slate-500 transition hover:text-slate-950 sm:inline">Docs</Link>
            <a href="https://x.com/PolyDeskTrade" target="_blank" rel="noreferrer" className="hidden text-slate-500 transition hover:text-slate-950 md:inline">Support</a>
            <Link to="/polydesk" className="about-primary-button about-header-cta">
              <span className="sm:hidden">Open</span><span className="hidden sm:inline">Open PolyDesk</span> <ArrowLongRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="about-snap-section about-hero is-section-active">
        <div className="about-section-grid">
          <div className="about-scene-copy max-w-2xl">
            <p className="about-kicker">Agentic prediction-market infrastructure</p>
            <h1 className="mt-7 text-balance text-[clamp(3rem,6.3vw,5.8rem)] font-semibold leading-[.94] tracking-[-0.06em]">
              Research the market. Govern the action. Keep the proof.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              PolyDesk is a Polymarket intelligence and buyer-governed execution platform. People and agents research live markets, verify funding, act within written limits, and keep machine-readable proof.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#discover" className="about-primary-button h-12 justify-center px-5">See how it works <ArrowLongRightIcon className="h-4 w-4" /></a>
              <a href="/api/a2mcp/services" className="about-secondary-button h-12 justify-center px-5">View machine catalog</a>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">Browse publicly. Connect only when ownership, payment, or a signature is required.</p>
          </div>

          <div className="about-scene-art">
            <figure className="about-media-frame about-media-frame--hero">
              <img
                src="/about/polydesk-okx-partnership.jpg"
                alt="PolyDesk available through the OKX.AI marketplace"
                decoding="async"
                fetchPriority="high"
                className="about-media-image about-crop-partnership"
              />
              <figcaption className="about-media-overlay">
                <span>PolyDesk on OKX.AI</span>
                <strong>Direct tools and governed trading from one provider.</strong>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {scenes.map(scene => (
        <section key={scene.id} id={scene.id} className="about-snap-section">
          <div className="about-section-grid about-product-grid">
            <div className="about-scene-art order-2 lg:order-1">
              <figure className="about-media-frame">
                <img src={scene.image} alt={scene.alt} loading="lazy" decoding="async" className={`about-media-image ${scene.imageClass}`} />
                <figcaption className="about-media-overlay">
                  <span>PolyDesk / {scene.index}</span>
                  <strong>{scene.overlay}</strong>
                </figcaption>
              </figure>
            </div>

            <div className="about-scene-copy about-product-copy order-1 max-w-xl lg:order-2">
              <p className="about-kicker">{scene.index} / {scene.label}</p>
              <h2 className="mt-4 text-balance text-[clamp(2.5rem,4.5vw,4.5rem)] font-semibold leading-[.98] tracking-[-0.055em]">{scene.title}</h2>
              <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{scene.body}</p>
              <InfrastructureBadges items={scene.infrastructure} />
              <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                {scene.points.map(([Icon, copy]) => (
                  <li key={copy as string} className="flex items-center gap-3 py-3.5 text-sm font-medium text-slate-700">
                    <Icon className="h-5 w-5 shrink-0 text-slate-400" />
                    {copy as string}
                  </li>
                ))}
              </ul>
              <Link to={scene.href} className="mt-7 inline-flex items-center gap-3 text-sm font-semibold text-slate-950 transition hover:gap-4">
                {scene.action} <ArrowLongRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      ))}

      <section id="proof" className="about-snap-section">
        <div className="about-section-grid about-product-grid">
          <div className="about-scene-art order-2 lg:order-1">
            <figure className="about-media-frame about-media-frame--marketplace">
              <img
                src="/about/okx-marketplace.png"
                alt="PolyDesk Agent 5427 services on the OKX.AI marketplace"
                loading="lazy"
                decoding="async"
                className="about-media-image about-crop-marketplace"
              />
              <figcaption className="about-media-overlay">
                <span>PolyDesk / 03</span>
                <strong>Proof agents can consume.</strong>
              </figcaption>
            </figure>
          </div>

          <div className="about-scene-copy about-product-copy order-1 max-w-xl lg:order-2">
            <p className="about-kicker">03 / Verify and distribute</p>
            <h2 className="mt-4 text-balance text-[clamp(2.5rem,4.5vw,4.5rem)] font-semibold leading-[.98] tracking-[-0.055em]">Buy one result or delegate the complete mission.</h2>
            <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Agent #5427 lets buyers purchase one machine-readable result, delegate one bounded trading task, or subscribe to recurring access. OKX.AI distributes the services; X Layer settles pay-per-use payments.
            </p>
            <InfrastructureBadges items={['okx', 'xlayer']} />
            <div className="about-offer-grid">
              <div className="about-offer-column">
                <p className="about-offer-label">Direct APIs</p>
                <dl>
                  <div><dt>Football Match Live Data</dt><dd>0.1</dd></div>
                  <div><dt>Football News Brief</dt><dd>0.1</dd></div>
                  <div><dt>Verified Polymarket Funding</dt><dd>0.1</dd></div>
                  <div><dt>Governed Polymarket Trader</dt><dd>0.1</dd></div>
                  <div><dt>Polymarket LP Scout</dt><dd>0.3</dd></div>
                </dl>
              </div>
              <div className="about-offer-column">
                <p className="about-offer-label">Delegated access</p>
                <dl>
                  <div><dt>One-off trading task</dt><dd>0.1</dd></div>
                  <div><dt>Trading membership</dt><dd>5 / month</dd></div>
                </dl>
                <p className="about-offer-currency">Prices in USDT</p>
              </div>
            </div>
            <a href="https://www.okx.ai/agents/5427" target="_blank" rel="noreferrer" className="about-primary-button mt-7 h-11 px-4">
              View Agent 5427 <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="about-footer" data-about-scroll-stop="true">
        <div className="about-footer-inner">
          <div className="about-footer-heading">
            <p>Built On Trusted Infrastructures</p>
          </div>

          <div className="about-infrastructure-strip" aria-label="PolyDesk infrastructure">
            <div className="about-infrastructure-fade about-infrastructure-fade--left" />
            <div className="about-infrastructure-fade about-infrastructure-fade--right" />
            <div className="about-infrastructure-track">
              {[0, 1].map(groupIndex => (
                <div key={groupIndex} className="about-infrastructure-group" aria-hidden={groupIndex === 1}>
                  {[...infrastructureOrder, ...infrastructureOrder].map((key, index) => {
                    const item = infrastructure[key]
                    const isDuplicate = groupIndex === 1 || index >= infrastructureOrder.length
                    return (
                      <a
                        key={`${groupIndex}-${key}-${index}`}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-hidden={isDuplicate}
                        tabIndex={isDuplicate ? -1 : undefined}
                        className={`about-infrastructure-link about-infrastructure-link--${key}`}
                      >
                        <span className="about-infrastructure-logo"><img src={item.logo} alt="" aria-hidden="true" /></span>
                        <span>{item.name}</span>
                      </a>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="about-footer-meta">
            <p>© 2026 PolyDesk. Profits are not guaranteed. External platforms remain subject to their own availability, rules, and regional restrictions.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
