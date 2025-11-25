import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Lobby from './pages/Lobby' 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Allow dynamic URLs like /lobby/ABCD */}
        <Route path="/lobby/:gameCode" element={<Lobby />} />
        {/* Redirect /lobby without code back to home */}
        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App