import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const createGame = async () => {
    setLoading(true)
    try {
      const response = await fetch("http://localhost:8000/create", { method: "POST" })
      const data = await response.json()
      
      // Store admin token in localStorage for later use
      localStorage.setItem(`dashflag_admin_${data.gameCode}`, data.adminToken)
      
      navigate(`/lobby/${data.gameCode}`)
    } catch (error) {
      alert("Failed to create game server!")
    } finally {
      setLoading(false)
    }
  }

  const joinGame = () => {
    if (code) navigate(`/lobby/${code}`)
  }

  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md space-y-8">
          <h1 className="text-6xl font-black text-primary tracking-tighter">DASHFLAG</h1>
          
          {/* JOIN CARD */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title justify-center">Join a Game</h2>
              <div className="join w-full">
                <input 
                  className="input input-bordered join-item w-full text-center uppercase text-xl" 
                  placeholder="CODE"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button className="btn btn-secondary join-item" onClick={joinGame}>GO</button>
              </div>
            </div>
          </div>

          <div className="divider">OR</div>

          {/* HOST BUTTON */}
          <button 
            className="btn btn-primary btn-lg w-full" 
            onClick={createGame}
            disabled={loading}
          >
            {loading ? <span className="loading loading-spinner"></span> : "Host New Game"}
          </button>
        </div>
      </div>
    </div>
  )
}