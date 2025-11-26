import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Confetti from 'react-confetti'

// --- TYPES ---
type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'INVALID_CODE' | 'DROPPED'

interface Challenge {
  id: string
  title: string
  category: string
  points: number
  desc?: string 
  solves?: number // NEW: Track how many people solved it
}

interface Player {
  name: string
  score: number
  solves: string[]
}

export default function Lobby() {
  const { gameCode } = useParams()
  const navigate = useNavigate()

  // --- STATE ---
  // Game Data
  const [leaderboard, setLeaderboard] = useState<Player[]>([])
  const [gameStatus, setGameStatus] = useState("waiting")
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [mySolves, setMySolves] = useState<string[]>([]) 
  const [endTime, setEndTime] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState("")

  // User Data
  const [nickname, setNickname] = useState("")
  const [hasJoined, setHasJoined] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // System Data
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING')
  const [toast, setToast] = useState<{msg: string, color: string} | null>(null)
  
  // UI Interaction
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null)
  const [flagInput, setFlagInput] = useState("")

  const socketRef = useRef<WebSocket | null>(null)
  const isInvalidCodeRef = useRef(false)

  // --- HELPERS ---
  const showToast = (msg: string, color: string) => {
      setToast({ msg, color })
      setTimeout(() => setToast(null), 4000)
  }

  const getRankStyle = (index: number) => {
    if (index === 0) return "bg-yellow-400 text-yellow-900 border-yellow-200 scale-110 z-10"
    if (index === 1) return "bg-slate-300 text-slate-800 border-slate-200"
    if (index === 2) return "bg-orange-400 text-orange-900 border-orange-300"
    return "bg-base-300 opacity-50"
  }

  // --- EFFECTS ---

  useEffect(() => {
    if (!endTime) return
    const interval = setInterval(() => {
      const now = Date.now() / 1000
      const diff = endTime - now
      if (diff <= 0) {
        setTimeLeft("00:00")
        clearInterval(interval)
      } else {
        const m = Math.floor(diff / 60)
        const s = Math.floor(diff % 60)
        setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [endTime])

  useEffect(() => {
    if (!gameCode) return
    setConnectionStatus('CONNECTING')
    isInvalidCodeRef.current = false
    setIsAdmin(false)
    
    const ws = new WebSocket(`ws://localhost:8000/ws/${gameCode}`)
    socketRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('CONNECTED')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === "ERROR" && data.payload === "INVALID_CODE") {
          isInvalidCodeRef.current = true
          setConnectionStatus('INVALID_CODE')
          ws.close()
        }
        else if (data.type === "LOBBY_UPDATE") {
          setLeaderboard(data.leaderboard)
          setGameStatus(data.status)
          if (data.challenges) setChallenges(data.challenges)
          if (data.endTime) setEndTime(data.endTime)
        }
        else if (data.type === "ADMIN_CONFIRMED") setIsAdmin(true)
        else if (data.type === "TOAST") {
            showToast(data.msg, data.color)
        }
        else if (data.type === "SOLVE_CONFIRMED") {
            setSelectedChallenge(null)
            setMySolves(prev => [...prev, data.id])
        }

      } catch (e) { console.error(e) }
    }

    ws.onclose = () => {
      if (!isInvalidCodeRef.current) setConnectionStatus('DROPPED')
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
      }
    }
  }, [gameCode])

  // --- ACTIONS ---

  const sendNickname = () => {
    if (socketRef.current && nickname.trim()) {
      const storedToken = localStorage.getItem(`dashflag_admin_${gameCode}`)
      socketRef.current.send(JSON.stringify({
        type: "JOIN",
        nickname: nickname,
        adminToken: storedToken
      }))
      setHasJoined(true)
    }
  }

  const startGame = () => {
    if (socketRef.current && isAdmin) {
      socketRef.current.send(JSON.stringify({ type: "START_GAME" }))
    }
  }

  const forceEndGame = () => {
      if(confirm("Are you sure you want to end the game?")) {
          socketRef.current?.send(JSON.stringify({ type: "END_GAME" }))
      }
  }

  const submitFlag = () => {
      if (socketRef.current && selectedChallenge) {
          socketRef.current.send(JSON.stringify({
              type: "SUBMIT_FLAG",
              challengeId: selectedChallenge.id,
              flag: flagInput
          }))
          setFlagInput("")
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
  
  if (!hasJoined) {
     return (
        <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-sm card bg-base-100 shadow-xl p-8 border border-primary">
             <h2 className="text-2xl font-bold mb-6">Enter Lobby {gameCode}</h2>
             <input className="input input-bordered input-primary w-full mb-4 text-center text-lg" placeholder="Nickname"
                autoFocus maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendNickname()} />
             <button className="btn btn-primary w-full" onClick={sendNickname}>Join Lobby</button>
          </div>
        </div>
      </div>
     )
  }

  return (
    <div className="flex flex-col h-screen bg-base-200 p-8 relative overflow-hidden">
      
      {gameStatus === 'ended' && (
        <Confetti width={window.innerWidth} height={window.innerHeight} className="z-100 pointer-events-none" />
      )}

      {toast && (
          <div className="toast toast-top toast-center z-50">
              <div className={`alert alert-${toast.color} shadow-lg font-bold`}>
                  <span>{toast.msg}</span>
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 shrink-0 relative z-10">
        <div>
          <h1 className="text-4xl font-bold text-primary tracking-tight">DashFlag</h1>
          <div className="badge badge-outline mt-2">Room: {gameCode}</div>
        </div>
        
        {gameStatus === 'active' && (
            <div className="font-mono text-4xl font-black text-secondary tracking-widest bg-base-100 px-4 py-2 rounded-lg shadow-inner">
                {timeLeft}
            </div>
        )}

        <div className="flex gap-2">
            {isAdmin && <div className="badge badge-accent badge-lg">ADMIN</div>}
            <div className={`badge badge-lg font-mono ${gameStatus === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                {gameStatus.toUpperCase()}
            </div>
        </div>
      </div>

      <div className="flex gap-6 h-full overflow-hidden relative z-10">
        
        {/* LEADERBOARD */}
        <div className="w-1/4 min-w-[250px] bg-base-100 rounded-box shadow-xl p-4 overflow-y-auto border border-base-300">
            <h2 className="text-xl font-bold mb-4 opacity-50 sticky top-0 bg-base-100 pb-2 border-b border-base-200">LEADERBOARD</h2>
            <ul className="space-y-2">
                {leaderboard.map((player, i) => (
                    <li key={i} className="flex justify-between items-center p-3 bg-base-200 rounded-lg transition-all hover:bg-base-300">
                        <div className="flex items-center gap-3">
                            <span className={`font-mono opacity-50 w-6 ${i < 3 ? 'font-bold text-warning' : ''}`}>#{i+1}</span>
                            <span className={`truncate max-w-[120px] ${player.name.includes("★") ? "text-accent font-bold" : ""}`}>{player.name}</span>
                        </div>
                        <span className="font-mono font-bold text-primary">{player.score}</span>
                    </li>
                ))}
            </ul>
        </div>

        {/* MAIN CONTENT */}
        <div className={`flex-1 relative bg-base-100 rounded-box shadow-xl border border-base-300 p-6 ${gameStatus === 'ended' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            
            {/* VIEW 1: WAITING */}
            {gameStatus === 'waiting' && (
                <div className="h-full flex flex-col items-center justify-center border-dashed border-2 border-base-200 rounded-lg">
                    <span className="loading loading-ring loading-lg scale-150 mb-4 text-primary"></span>
                    <p className="opacity-50 mb-8">Waiting for admin to initialize...</p>
                    {isAdmin && (
                        <button className="btn btn-primary btn-lg px-12 shadow-lg shadow-primary/20" onClick={startGame}>START GAME</button>
                    )}
                </div>
            )}

            {/* VIEW 2: GAME GRID */}
            {gameStatus === 'active' && (
                <>
                    {isAdmin && (
                        <button className="btn btn-xs btn-error absolute top-4 right-4 z-10 opacity-50 hover:opacity-100" onClick={forceEndGame}>FORCE END</button>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {challenges.map((c) => {
                            const isSolved = mySolves.includes(c.id);
                            return (
                                <div key={c.id} 
                                     onClick={() => !isSolved && setSelectedChallenge(c)}
                                     className={`card border-2 transition-all duration-300 hover:-translate-y-1 cursor-pointer
                                        ${isSolved 
                                            ? "bg-success/10 border-success opacity-60 grayscale-[0.5]" 
                                            : "bg-base-100 border-base-300 hover:border-primary hover:shadow-lg hover:shadow-primary/10"
                                        }`}
                                >
                                    <div className="card-body items-center text-center p-6 relative">
                                        {/* SOLVE COUNT BADGE */}
                                        <div className="absolute top-2 right-2 text-xs font-mono opacity-50 bg-base-200 px-2 rounded">
                                            {c.solves || 0} solves
                                        </div>

                                        <div className="badge badge-outline mb-2 text-xs">{c.category}</div>
                                        <h2 className="card-title text-4xl font-black tracking-tight">{c.points}</h2>
                                        <p className="font-bold opacity-75 text-sm mt-2">{c.title}</p>
                                        {isSolved && <div className="badge badge-success badge-lg mt-3 text-white font-bold">SOLVED</div>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {/* VIEW 3: PODIUM */}
            {gameStatus === 'ended' && (
                <div className="h-full flex flex-col items-center justify-center pt-10 overflow-hidden">
                    <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary mb-12 animate-pulse">
                        GAME OVER
                    </h2>
                    <div className="flex items-end gap-4 mb-12">
                        <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-32 h-48 justify-end transition-all ${getRankStyle(1)}`}>
                            <div className="font-bold text-xl mb-2 truncate max-w-full">{leaderboard[1]?.name || "-"}</div>
                            <div className="text-3xl font-black">{leaderboard[1]?.score || 0}</div>
                            <div className="mt-2 font-mono opacity-50">2ND</div>
                        </div>
                        <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-40 h-64 justify-end shadow-2xl shadow-primary/20 transition-all ${getRankStyle(0)}`}>
                            <div className="text-5xl mb-4">👑</div>
                            <div className="font-bold text-2xl mb-2 truncate max-w-full">{leaderboard[0]?.name || "-"}</div>
                            <div className="text-4xl font-black">{leaderboard[0]?.score || 0}</div>
                            <div className="mt-2 font-mono font-bold">1ST</div>
                        </div>
                        <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-32 h-40 justify-end transition-all ${getRankStyle(2)}`}>
                            <div className="font-bold text-xl mb-2 truncate max-w-full">{leaderboard[2]?.name || "-"}</div>
                            <div className="text-3xl font-black">{leaderboard[2]?.score || 0}</div>
                            <div className="mt-2 font-mono opacity-50">3RD</div>
                        </div>
                    </div>
                    <button className="btn btn-outline btn-wide z-50" onClick={() => navigate('/')}>Back to Home</button>
                </div>
            )}
        </div>
      </div>

      {/* CHALLENGE MODAL */}
      {selectedChallenge && (
          <div className="modal modal-open bg-black/50 backdrop-blur-sm z-50">
              <div className="modal-box relative border border-primary shadow-2xl shadow-primary/20">
                  <button onClick={() => setSelectedChallenge(null)} className="btn btn-sm btn-circle absolute right-2 top-2">✕</button>
                  <h3 className="text-lg font-bold text-primary tracking-widest">{selectedChallenge.title}</h3>
                  <div className="badge badge-secondary mb-4 mt-1">{selectedChallenge.points} PTS</div>
                  
                  <div className="bg-base-200 p-4 rounded-lg my-4 font-mono text-sm border border-base-300">
                    {selectedChallenge.desc}
                  </div>
                  
                  <div className="join w-full mt-2">
                      <input className="input input-bordered input-primary join-item w-full font-mono" 
                        placeholder="format{flag_here}" value={flagInput}
                        onChange={(e) => setFlagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitFlag()} />
                      <button className="btn btn-primary join-item px-8" onClick={submitFlag}>SUBMIT</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  )
}