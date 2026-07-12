import { Navigate, Route, Routes } from 'react-router-dom'
import PolyDeskLayout from './layouts/PolyDeskLayout'
import About from './pages/About'
import PolyDesk from './pages/PolyDesk'
import LPScoutReport from './pages/LPScoutReport'
import X402Receipt from './pages/X402Receipt'

export default function App() {
  return (
    <Routes>
      <Route element={<PolyDeskLayout />}>
        <Route path="/" element={<PolyDesk />} />
        <Route path="/polydesk" element={<PolyDesk />} />
      </Route>
      <Route path="/about" element={<About />} />
      <Route path="/receipt/:activityId" element={<X402Receipt />} />
      <Route path="/report/lp-scout/:activityId" element={<LPScoutReport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
