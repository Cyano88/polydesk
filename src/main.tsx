import React, { lazy, Suspense, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { PolyDeskLoadingState } from './components/PolyDeskLoadState'
import { clearChunkRecoveryMarker, recoverFromChunkLoadFailure } from './lib/chunkRecovery'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './styles.css'

const ProductApp = lazy(() => import('./ProductApp'))

class AppErrorBoundary extends React.Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[polydesk:error-boundary]', error)
    recoverFromChunkLoadFailure(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-950 dark:bg-[#0f1014] dark:text-white">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-500">PolyDesk</p>
          <h1 className="mt-2 text-xl font-black tracking-tight">Something failed to open</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Reopen PolyDesk. If it repeats, send this message to support.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-gray-950 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">
            Reload PolyDesk
          </button>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {this.state.error.message}
          </pre>
        </section>
      </main>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<PolyDeskLoadingState fullScreen label="Opening PolyDesk" />}>
        <ProductApp />
      </Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
)

window.setTimeout(clearChunkRecoveryMarker, 10_000)
