import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import SignupPage from './pages/SignupPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CollectionWorkspacePage from './pages/CollectionWorkspacePage'
import AnswerRunPlayPage from './pages/AnswerRunPlayPage'
import HostSessionPage from './pages/HostSessionPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/dashboard/collections/:collectionId" element={<CollectionWorkspacePage />} />
      <Route path="/play/:sessionCode" element={<AnswerRunPlayPage />} />
      <Route path="/host/:sessionId" element={<HostSessionPage />} />
    </Routes>
  )
}

export default App
