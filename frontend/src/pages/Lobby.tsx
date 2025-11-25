import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'INVALID_CODE' | 'DROPPED'

export default function Lobby() {
  const { gameCode } = useParams()
  const navigate = useNavigate()

  // Game State
  const [players, setPlayers] = useState<string[]>([])
  const [gameStatus, setGameStatus] = useState("waiting")
  const [nickname, setNickname] = useState("")
  const [hasJoined, setHasJoined] = useState(false)
  
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING')
  
  const socketRef = useRef<WebSocket | null>(null)
  const isInvalidCodeRef = useRef(false)

  useEffect(() => {
    if (!gameCode) return

    setConnectionStatus('CONNECTING')
    isInvalidCodeRef.current = false
    
    const ws = new WebSocket(`ws://localhost:8000/ws/${gameCode}`)
    socketRef.current = ws

    ws.onopen = () => {
      console.log("Connected")
      setConnectionStatus('CONNECTED')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // 1. CATCH ERROR FROM SERVER
        if (data.type === "ERROR" && data.payload === "INVALID_CODE") {
          isInvalidCodeRef.current = true
          setConnectionStatus('INVALID_CODE')
          ws.close()
          return
        }

        if (data.type === "LOBBY_UPDATE") {
          setPlayers(data.players)
          setGameStatus(data.status)
        }
      } catch (e) {
        console.error("Failed to parse", e)
      }
    }

    ws.onclose = () => {
      if (!isInvalidCodeRef.current) {
        setConnectionStatus('DROPPED')
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
      }
    }
  }, [gameCode])

  const sendNickname = () => {
    if (socketRef.current && nickname.trim()) {
      socketRef.current.send(JSON.stringify({
        type: "JOIN",
        nickname: nickname
      }))
      setHasJoined(true)
    }
  }

  // --- UI: LOADING ---
  if (connectionStatus === 'CONNECTING') {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div>
            <span className="loading loading-infinity loading-lg text-primary scale-150"></span>
            <p className="mt-4 text-opacity-50">Connecting to lobby...</p>
          </div>
        </div>
      </div>
    )
  }

  // --- UI: INVALID CODE ---
  if (connectionStatus === 'INVALID_CODE') {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-9xl font-black text-base-content opacity-10">404</h1>
            <h2 className="text-3xl font-bold text-error mt-4">Invalid Game Code</h2>
            <p className="py-6">The lobby <span className="font-mono bg-base-300 px-2 rounded">{gameCode}</span> does not exist.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Return Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- UI: DROPPED CONNECTION ---
  if (connectionStatus === 'DROPPED') {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-9xl font-black text-base-content opacity-10">LOST</h1>
            <h2 className="text-3xl font-bold text-warning mt-4">Connection Dropped</h2>
            <p className="py-6">Signal lost with the server.</p>
            <button className="btn btn-outline" onClick={() => window.location.reload()}>
              Reconnect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- UI: NICKNAME ENTRY ---
  if (!hasJoined) {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-sm card bg-base-100 shadow-xl p-8">
             <h2 className="text-2xl font-bold mb-6">Enter Lobby {gameCode}</h2>
             <input 
                className="input input-bordered w-full mb-4"
                placeholder="Enter Nickname"
                maxLength={12}
                autoFocus
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendNickname()}
             />
             <button className="btn btn-primary w-full" onClick={sendNickname}>Join Lobby</button>
          </div>
        </div>
      </div>
    )
  }

  // --- UI: LOBBY SCREEN ---
  return (
    <div className="flex flex-col h-screen bg-base-200 p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-primary tracking-tight">DashFlag</h1>
          <div className="badge badge-outline mt-2">Room: {gameCode}</div>
        </div>
        <div className="badge badge-lg badge-secondary font-mono">{gameStatus.toUpperCase()}</div>
      </div>

      <div className="card bg-base-100 shadow-xl flex-1 border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-6">
            Players Joined <span className="badge badge-neutral ml-2">{players.length}</span>
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {players.map((p, i) => (
              <div key={i} className="btn btn-lg btn-ghost bg-base-200 no-animation cursor-default border-base-300">
                {p}
              </div>
            ))}
          </div>
          
          <div className="mt-auto text-center">
             <span className="loading loading-dots loading-lg opacity-50"></span>
             <p className="text-sm opacity-50 mt-2">Waiting for host to start the game...</p>
          </div>
        </div>
      </div>
    </div>
  )
}