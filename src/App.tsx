import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BroadcastProvider } from './contexts/BroadcastContext'
import { LandingPage } from './pages/LandingPage'
import { BroadcasterPage } from './pages/BroadcasterPage'
import { StudioPage } from './pages/StudioPage'

/**
 * App — Root component.
 *
 * Routing:
 *   /            → Landing (mode selection)
 *   /broadcaster → Broadcaster mode (mobile camera)
 *   /studio      → Studio mode (desktop production)
 *   *            → Redirect to /
 */
export default function App() {
  return (
    <BroadcastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/broadcaster" element={<BroadcasterPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </BroadcastProvider>
  )
}
