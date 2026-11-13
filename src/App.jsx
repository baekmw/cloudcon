import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import ConcertDetailPage from './pages/ConcertDetailPage.jsx'
import ExplorePage from './pages/ExplorePage.jsx'
import HomePage from './pages/HomePage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="concerts/:id" element={<ConcertDetailPage />} />
        <Route path="alerts" element={<AlertsPage />} />
      </Route>
    </Routes>
  )
}
