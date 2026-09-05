import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PolyDeskLoadingState } from './components/PolyDeskLoadState'

const About = lazy(() => import('./pages/About'))
const Integrations = lazy(() => import('./pages/Integrations'))
const LPScoutReport = lazy(() => import('./pages/LPScoutReport'))
const LPScoutContinuation = lazy(() => import('./pages/LPScoutContinuation'))
const Opportunity = lazy(() => import('./pages/Opportunity'))
const DocsLayout = lazy(() => import('./pages/docs/DocsLayout'))
const DocsOverview = lazy(() => import('./pages/docs/DocsOverview'))
const DocsPlatforms = lazy(() => import('./pages/docs/DocsPlatforms'))
const DocsOkxAI = lazy(() => import('./pages/docs/DocsOkxAI'))

function RouteLoading() {
  return <PolyDeskLoadingState fullScreen label="Opening PolyDesk" />
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<About />} />
        <Route path="/polydesk" element={<Navigate to="/integrations" replace />} />
        <Route path="/rewards" element={<Navigate to="/integrations" replace />} />
        <Route path="/about" element={<Navigate to="/" replace />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/continue/lp-scout" element={<LPScoutContinuation />} />
        <Route path="/report/lp-scout/:activityId" element={<LPScoutReport />} />
        <Route path="/opportunity/:slug" element={<Opportunity />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsOverview />} />
          <Route path="platforms" element={<DocsPlatforms />} />
          <Route path="okx-ai" element={<DocsOkxAI />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
