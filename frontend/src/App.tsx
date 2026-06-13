import { BrowserRouter, Route, Routes } from 'react-router-dom'
import MapDashboard from './components/MapDashboard'
import HospitalOsPage from './pages/HospitalOsPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapDashboard />} />
        <Route path="/hospital-os/:hospitalId" element={<HospitalOsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
