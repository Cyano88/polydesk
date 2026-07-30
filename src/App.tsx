import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PolyDeskLayout from './layouts/PolyDeskLayout'
import { PolyDeskLoadingState } from './components/PolyDeskLoadState'

const About = lazy(() => import('./pages/About'))
const PolyDesk = lazy(() => import('./pages/PolyDesk'))
const LPScoutReport = lazy(() => import('./pages/LPScoutReport'))
const Opportunity = lazy(() => import('./pages/Opportunity'))
const DocsLayout = lazy(() => import('./pages/docs/DocsLayout'))
const DocsOverview = lazy(() => import('./pages/docs/DocsOverview'))
const DocsOkxAI = lazy(() => import('./pages/docs/DocsOkxAI'))
const OkxRewards = lazy(() => import('./pages/OkxRewards'))

function RouteLoading() {
  return <PolyDeskLoadingState fullScreen label="Opening PolyDesk" />
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<PolyDeskLayout />}>
          <Route path="/" element={<PolyDesk />} />
          <Route path="/polydesk" element={<PolyDesk />} />
          <Route path="/rewards" element={<OkxRewards />} />
        </Route>
        <Route path="/about" element={<About />} />
        <Route path="/report/lp-scout/:activityId" element={<LPScoutReport />} />
        <Route path="/opportunity/:slug" element={<Opportunity />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsOverview />} />
          <Route path="okx-ai" element={<DocsOkxAI />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
