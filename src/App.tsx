import { Navigate, Route, Routes } from 'react-router-dom'
import PolyDeskLayout from './layouts/PolyDeskLayout'
import About from './pages/About'
import PolyDesk from './pages/PolyDesk'

export default function App() {
  return (
    <Routes>
      <Route element={<PolyDeskLayout />}>
        <Route path="/" element={<PolyDesk />} />
        <Route path="/polydesk" element={<PolyDesk />} />
      </Route>
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
