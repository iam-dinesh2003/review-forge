import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import ReviewsPage from './pages/ReviewsPage'
import PRDetailPage from './pages/PRDetailPage'
import RepositoriesPage from './pages/RepositoriesPage'
import SettingsPage from './pages/SettingsPage'
import CandidatesPage from './pages/CandidatesPage'
import CandidateDetailPage from './pages/CandidateDetailPage'
import RankingPage from './pages/RankingPage'
import BatchCandidatePage from './pages/BatchCandidatePage'
import ComparePage from './pages/ComparePage'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/review/:id" element={<PRDetailPage />} />
        <Route path="/repositories" element={<RepositoriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/candidates" element={<CandidatesPage />} />
        <Route path="/candidate/:id" element={<CandidateDetailPage />} />
        <Route path="/candidates/ranking" element={<RankingPage />} />
        <Route path="/candidates/batch" element={<BatchCandidatePage />} />
        <Route path="/candidates/compare" element={<ComparePage />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <AnimatedRoutes />
      </Layout>
    </BrowserRouter>
  )
}
