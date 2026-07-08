import { Navigate, Route, Routes } from 'react-router-dom'
import About from './pages/About'
import PolyDesk from './pages/PolyDesk'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PolyDesk />} />
      <Route path="/polydesk" element={<PolyDesk />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
