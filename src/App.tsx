import { Navigate, Route, Routes } from 'react-router-dom'
import PolyDesk from './pages/PolyDesk'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PolyDesk />} />
      <Route path="/polydesk" element={<PolyDesk />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
