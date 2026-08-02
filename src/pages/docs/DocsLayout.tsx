import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ExternalLink, Menu, X } from '../../components/icons'

const sections = [
  {
    label: 'PolyDesk',
    links: [
      { label: 'Overview', path: '/docs', end: true },
      { label: 'OKX.AI services', path: '/docs/okx-ai' },
    ],
  },
  {
    label: 'Machine interfaces',
    links: [
      { label: 'Service catalog', path: '/api/a2mcp/services', external: true },
      { label: 'Trader flow', path: '/api/polymarket-agent-flow', external: true },
    ],
  },
]

export default function DocsLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen bg-white font-inter text-gray-950">
      <header className="sticky top-0 z-50 h-14 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-screen-xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
              onClick={() => setOpen(value => !value)}
              aria-label="Toggle documentation navigation"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="flex items-center gap-2">
              <img src="/brand/polydesk-mark-bw-transparent.svg" alt="" className="h-6 w-6" />
              <span className="font-semibold tracking-tight">PolyDesk</span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm font-medium text-gray-500">Docs</span>
            </Link>
          </div>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-950">
            <ExternalLink className="h-3.5 w-3.5" />
            Open app
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-xl">
        <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed top-14 z-40 h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white transition-transform lg:sticky lg:translate-x-0`}>
          <nav className="space-y-6 px-3 py-6">
            {sections.map(section => (
              <section key={section.label}>
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{section.label}</p>
                <ul className="space-y-0.5">
                  {section.links.map(link => (
                    <li key={link.path}>
                      {'external' in link ? (
                        <a className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-950" href={link.path}>
                          {link.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <NavLink
                          to={link.path}
                          end={'end' in link ? link.end : false}
                          onClick={() => setOpen(false)}
                          className={({ isActive }) => `block rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-gray-100 font-medium text-gray-950' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'}`}
                        >
                          {link.label}
                        </NavLink>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </aside>
        {open && <button type="button" className="fixed inset-0 top-14 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close documentation navigation" />}
        <main className="min-w-0 flex-1 px-6 py-12 lg:px-16">
          <div className="max-w-3xl"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
