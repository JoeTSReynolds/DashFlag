import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Confetti from 'react-confetti'

type ViewState = 'LOADING' | 'AUTH' | 'NICKNAME' | 'TEAM_SELECT' | 'LOBBY' | 'ADMIN_VIEW'

// --- INTERFACES ---
interface Player {
    id: string
    name: string
    score: number
    is_connected: boolean
}

interface Team {
    id: string
    name: string
    score: number
    is_solo: boolean
    members: Player[]
}

interface SolveLog {
    team_name: string
    time_str: string
}

interface Challenge {
    id: string
    title: string
    category: string
    points: number
    solves: number
    desc?: string
    solve_history?: SolveLog[] // Only populated for Admins
}

export default function Lobby() {
    const { gameCode } = useParams()
    const navigate = useNavigate()
    const socketRef = useRef<WebSocket | null>(null)
    const invalidCodeRef = useRef(false)

    // --- STATE ---
    const [viewState, setViewState] = useState<ViewState>('LOADING')
    const [leaderboard, setLeaderboard] = useState<Team[]>([])
    const [expandedTeams, setExpandedTeams] = useState<string[]>([])
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [gameStatus, setGameStatus] = useState("waiting")
    const [timeLeft, setTimeLeft] = useState("")
    const [endTime, setEndTime] = useState<number | null>(null)
    const [toast, setToast] = useState<{msg: string, color: string} | null>(null)
    const [teamsEnabled, setTeamsEnabled] = useState(true) 

    // User Info
    const [nickname, setNickname] = useState("")
    const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
    const [myTeam, setMyTeam] = useState<{id: string, name: string, is_solo: boolean} | null>(null)
    const [mySolves, setMySolves] = useState<string[]>([])
    
    // Admin Info
    const [isAdmin, setIsAdmin] = useState(false)

    // Inputs
    const [teamName, setTeamName] = useState("")
    const [teamCodeJoin, setTeamCodeJoin] = useState("")
    const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null)
    const [flagInput, setFlagInput] = useState("")
    const [showAdminStats, setShowAdminStats] = useState(false)

    // Connection State for UI
    const [connectionError, setConnectionError] = useState<string | null>(null)

    // --- HELPERS ---
    const toggleTeamExpand = (teamId: string) => {
        setExpandedTeams(prev => 
            prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
        )
    }

    const showToast = (msg: string, color: string) => {
        setToast({ msg, color })
        setTimeout(() => setToast(null), 3000)
    }

    const getRankStyle = (index: number) => {
        if (index === 0) return "bg-yellow-400 text-yellow-900 border-yellow-200 scale-110 z-10" 
        if (index === 1) return "bg-slate-300 text-slate-800 border-slate-200"
        if (index === 2) return "bg-orange-400 text-orange-900 border-orange-300" 
        return "bg-base-300 opacity-50"
    }

    // --- WEBSOCKET SETUP ---
    useEffect(() => {
        if (!gameCode) return
        
        setConnectionError(null)
        invalidCodeRef.current = false
        
        // Dynamic WebSocket URL construction
        let wsUrl = import.meta.env.VITE_WS_URL
        if (!wsUrl) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            wsUrl = `${protocol}//${window.location.host}`
        }
        
        const ws = new WebSocket(`${wsUrl}/ws/${gameCode}`)
        socketRef.current = ws

        ws.onopen = () => {
            const adminToken = localStorage.getItem(`dashflag_admin_${gameCode}`)
            if (adminToken) {
                ws.send(JSON.stringify({ type: "ADMIN_AUTH", token: adminToken }))
            } else {
                const savedPlayerId = localStorage.getItem(`dashflag_pid_${gameCode}`)
                ws.send(JSON.stringify({ type: "PLAYER_JOIN", playerId: savedPlayerId }))
            }
        }

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            
            if (data.type === "ERROR" && data.payload === "INVALID_CODE") {
                invalidCodeRef.current = true
                setConnectionError("INVALID_CODE")
                ws.close()
            }
            else if (data.type === "ADMIN_CONFIRMED") {
                setIsAdmin(true)
                setViewState("ADMIN_VIEW")
            }
            else if (data.type === "READY_TO_PICK_TEAM") {
                setTeamsEnabled(data.teamsEnabled) 
                setViewState("NICKNAME")
            }
            else if (data.type === "PLAYER_RESTORED") {
                setMyPlayerId(data.playerId)
                setMyTeam({ id: data.teamId, name: data.teamName, is_solo: data.isSolo })
                setMySolves(data.solves)
                setViewState("LOBBY")
            }
            else if (data.type === "PLAYER_CONFIRMED") {
                setMyPlayerId(data.playerId)
                localStorage.setItem(`dashflag_pid_${gameCode}`, data.playerId) 
                setMyTeam({ id: data.teamId, name: data.teamName, is_solo: data.isSolo })
                setMySolves(data.solves)
                setViewState("LOBBY")
            }
            else if (data.type === "LOBBY_UPDATE") {
                setLeaderboard(data.leaderboard)
                setGameStatus(data.status)
                if (data.challenges) setChallenges(data.challenges)
                if (data.endTime) setEndTime(data.endTime)
            }
            else if (data.type === "KICKED") {
                localStorage.removeItem(`dashflag_pid_${gameCode}`)
                alert("You have been kicked.")
                window.location.reload()
            }
            else if (data.type === "TOAST") showToast(data.msg, data.color)
            else if (data.type === "SOLVE_CONFIRMED") {
                setSelectedChallenge(null)
                setMySolves(prev => [...prev, data.id])
            }
        }

        ws.onclose = () => {
            if (!invalidCodeRef.current) {
               setConnectionError("DROPPED")
            }
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.onclose = null
                socketRef.current.close()
            }
        }
    }, [gameCode])

    // --- SYNC TABS ---
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === `dashflag_pid_${gameCode}` && e.newValue) {
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ type: "PLAYER_JOIN", playerId: e.newValue }))
                }
            }
        }
        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [gameCode])

    // --- TIMER ---
    useEffect(() => {
        if (!endTime) return
        const i = setInterval(() => {
            const diff = endTime - (Date.now() / 1000)
            if (diff <= 0) {
                setTimeLeft("00:00")
                if (gameStatus === 'active') {
                    // Trigger server check to officially end game
                    socketRef.current?.send(JSON.stringify({ type: "CHECK_TIME" }))
                }
            }
            else {
                const d = Math.floor(diff / (3600 * 24))
                const h = Math.floor((diff % (3600 * 24)) / 3600)
                const m = Math.floor((diff % 3600) / 60)
                const s = Math.floor(diff % 60)

                if (d > 0) {
                    setTimeLeft(`${d} Days, ${h} Hours, ${m} Mins`)
                } else if (h > 0) {
                    setTimeLeft(`${h} Hours, ${m} Mins`)
                } else {
                    setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
                }
            }
        }, 1000)
        return () => clearInterval(i)
    }, [endTime])

    // --- ACTIONS ---
    const joinGame = (type: string) => {
        const base = { type, nickname }
        if (type === "CREATE_TEAM") socketRef.current?.send(JSON.stringify({ ...base, teamName }))
        else if (type === "JOIN_TEAM") socketRef.current?.send(JSON.stringify({ ...base, teamCode: teamCodeJoin }))
        else socketRef.current?.send(JSON.stringify({ ...base })) // SOLO
    }

    const handleNicknameSubmit = () => {
        if (!nickname.trim()) return
        
        if (!teamsEnabled) {
            joinGame('JOIN_SOLO')
        } else {
            setViewState('TEAM_SELECT')
        }
    }

    const leaveGame = () => {
        if(confirm("Leave game? You will lose progress.")) {
            socketRef.current?.send(JSON.stringify({ type: "LEAVE_GAME" }))
            localStorage.removeItem(`dashflag_pid_${gameCode}`)
            navigate('/')
        }
    }

    const adminAction = (type: string, payload: any) => {
        socketRef.current?.send(JSON.stringify({ type, ...payload }))
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

    // --- RENDER VIEWS ---

    // 0. CONNECTING / ERRORS
    if (connectionError === 'INVALID_CODE') return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-9xl font-black text-base-content opacity-10">404</h1>
            <h2 className="text-3xl font-bold text-error mt-4">Invalid Game Code</h2>
            <p className="py-6">The lobby <span className="font-mono bg-base-300 px-2 rounded">{gameCode}</span> does not exist.</p>
            <button className="btn btn-primary px-8" onClick={() => navigate('/')}>
              Return Home
            </button>
          </div>
        </div>
      </div>
    )
    
    if (connectionError === 'DROPPED') return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-9xl font-black text-base-content opacity-10">LOST</h1>
            <h2 className="text-3xl font-bold text-warning mt-4">Connection Dropped</h2>
            <p className="py-6">Signal lost with the server.</p>
            <button className="btn btn-outline px-8" onClick={() => window.location.reload()}>
              Reconnect
            </button>
          </div>
        </div>
      </div>
    )

    if (viewState === 'LOADING') return <div className="min-h-screen flex items-center justify-center"><span className="loading loading-infinity loading-lg scale-150 text-primary"></span></div>

    // 1. NICKNAME
    if (viewState === "NICKNAME") return (
        <div className="min-h-screen bg-base-200 flex items-center justify-center">
            {toast && <div className="toast toast-top toast-center z-50"><div className={`alert alert-${toast.color} shadow-lg font-bold`}><span>{toast.msg}</span></div></div>}
            <div className="card bg-base-100 shadow-xl p-8 w-96">
                <h2 className="text-2xl font-bold mb-4">Who are you?</h2>
                <input className="input input-bordered w-full mb-4 px-4" placeholder="Nickname" maxLength={16} value={nickname} onChange={e => setNickname(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNicknameSubmit()} />
                <button className="btn btn-primary w-full px-8" onClick={handleNicknameSubmit}>
                    {teamsEnabled ? "Next" : "Join Game"}
                </button>
            </div>
        </div>
    )

    // 2. TEAM SELECT
    if (viewState === "TEAM_SELECT") return (
        <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
            {toast && <div className="toast toast-top toast-center z-50"><div className={`alert alert-${toast.color} shadow-lg font-bold`}><span>{toast.msg}</span></div></div>}
            <div className="card bg-base-100 shadow-xl p-8 max-w-4xl w-full">
                <h2 className="text-3xl font-bold mb-8 text-center">Choose Your Path</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-base-200 p-6 rounded-box text-center">
                        <h3 className="font-bold text-lg mb-4">Create Team</h3>
                        <input className="input input-bordered w-full mb-4 px-4" placeholder="Team Name" maxLength={16} value={teamName} onChange={e => setTeamName(e.target.value)} />
                        <button className="btn btn-primary w-full px-8" onClick={() => joinGame("CREATE_TEAM")}>Create</button>
                    </div>
                    <div className="bg-base-200 p-6 rounded-box text-center">
                        <h3 className="font-bold text-lg mb-4">Join Team</h3>
                        <input className="input input-bordered w-full mb-4 px-4" placeholder="4-Digit Code" maxLength={4} value={teamCodeJoin} onChange={e => setTeamCodeJoin(e.target.value)} />
                        <button className="btn btn-secondary w-full px-8" onClick={() => joinGame("JOIN_TEAM")}>Join</button>
                    </div>
                    <div className="bg-base-200 p-6 rounded-box text-center flex flex-col justify-between">
                        <div><h3 className="font-bold text-lg mb-4">Lone Wolf</h3><p className="opacity-50 text-sm">Play as a solo operative.</p></div>
                        <button className="btn btn-accent w-full mt-4 px-8" onClick={() => joinGame("JOIN_SOLO")}>Go Solo</button>
                    </div>
                </div>
                <button className="btn btn-neutral mt-4 px-8" onClick={() => setViewState("NICKNAME")}>Back</button>
            </div>
        </div>
    )

    // 3. MAIN GAME
    if (viewState === "LOBBY" || viewState === "ADMIN_VIEW") return (
        <div className="flex flex-col h-screen bg-base-200 p-6 overflow-hidden">
            {toast && <div className="toast toast-top toast-center z-50"><div className={`alert alert-${toast.color} shadow-lg font-bold`}><span>{toast.msg}</span></div></div>}
            {gameStatus === 'ended' && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} className="z-50 pointer-events-none" />}

            {/* HEADER - Increased Gap and Padding */}
            <div className="navbar bg-base-100 shadow-lg rounded-box mb-6 z-10 p-4 gap-8">
                <div className="flex-1">
                    <a className="btn btn-ghost normal-case text-2xl text-primary font-black">DashFlag</a>
                    <div className="badge badge-outline ml-4 p-3">Room: {gameCode}</div>
                </div>
                
                {/* CENTER: TIMER OR STATUS */}
                <div className="flex-none">
                    {gameStatus === 'active' ? (
                        <div className="font-mono text-4xl font-black text-secondary tracking-widest bg-base-200 px-6 py-2 rounded-xl border border-base-300 shadow-inner">
                            {timeLeft}
                        </div>
                    ) : (
                        <div className="badge badge-lg font-mono p-4">{gameStatus.toUpperCase()}</div>
                    )}
                </div>

                <div className="flex-none gap-4 flex items-center">
                    {isAdmin && (
                        <>
                            <div className="badge badge-error gap-2 p-3 font-bold mr-4">ADMIN MODE</div>
                            {gameStatus === 'waiting' && <button className="btn btn-primary px-6" onClick={() => adminAction("START_GAME", {})}>Start Game</button>}
                            {gameStatus === 'active' && <button className="btn btn-error px-6" onClick={() => adminAction("END_GAME", {})}>Force End</button>}
                            {gameStatus === 'ended' && (
                                <button className="btn btn-secondary px-6" onClick={() => setShowAdminStats(!showAdminStats)}>
                                    {showAdminStats ? "View Podium" : "View Solves"}
                                </button>
                            )}
                        </>
                    )}
                    {!isAdmin && myTeam && (
                        <div className="flex flex-col items-end mr-4">
                            <span className="font-bold text-lg">{myTeam.name}</span>
                            {!myTeam.is_solo && <span className="text-xs opacity-50 font-mono bg-base-200 px-2 rounded">Code: {myTeam.id}</span>}
                        </div>
                    )}
                    {!isAdmin && <button className="btn btn-error px-6 shadow-md text-red-500" onClick={leaveGame}>Leave</button>}
                </div>
            </div>

            <div className="flex gap-6 h-full overflow-hidden relative z-10">
                
                {/* LEADERBOARD (LEFT) */}
                <div className="w-1/3 min-w-[300px] bg-base-100 rounded-box shadow-xl p-4 overflow-y-auto border border-base-300">
                    <h2 className="text-lg font-bold opacity-50 mb-4 sticky top-0 bg-base-100 pb-2 border-b border-base-200">LEADERBOARD</h2>
                    <div className="space-y-2">
                        {leaderboard.map((team, i) => (
                            <div key={team.id} className="bg-base-200 rounded-lg overflow-hidden transition-all">
                                <div className="p-3 flex justify-between items-center cursor-pointer hover:bg-base-300" onClick={() => !team.is_solo && toggleTeamExpand(team.id)}>
                                    <div className="flex items-center gap-3">
                                        <span className={`font-mono font-bold w-6 opacity-50 ${i < 3 ? 'text-warning' : ''}`}>#{i+1}</span>
                                        <div className="flex flex-col">
                                            <span className={`font-bold ${team.id === myTeam?.id ? 'text-primary' : ''}`}>
                                                {team.name} 
                                            </span>
                                            {!team.is_solo && <span className="text-[10px] opacity-50">{team.members.length} members</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">{team.score}</span>
                                        {isAdmin && team.is_solo && (
                                            <button className="btn btn-xs btn-circle btn-error btn-outline" title="Kick Player" 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    adminAction("KICK_TEAM", {teamId: team.id})
                                                }}>✕</button>
                                        )}
                                        {!team.is_solo && (
                                            <span className="text-xs opacity-50">{expandedTeams.includes(team.id) ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </div>
                                
                                {expandedTeams.includes(team.id) && !team.is_solo && (
                                    <div className="bg-base-300 p-2 text-sm border-t border-base-100 shadow-inner">
                                        {team.members.map(member => (
                                            <div key={member.id} className="flex justify-between px-2 py-1 items-center">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${member.is_connected ? 'bg-success' : 'bg-error'}`}></div>
                                                    <span>{member.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono opacity-70">{member.score} pts</span>
                                                    {isAdmin && (
                                                        <button className="btn btn-xs btn-circle btn-error btn-outline" title="Kick Player" 
                                                            onClick={() => adminAction("KICK_PLAYER", {playerId: member.id})}>✕</button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {isAdmin && <button className="btn btn-xs btn-error btn-outline w-full mt-2" onClick={() => adminAction("KICK_TEAM", {teamId: team.id})}>KICK TEAM</button>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* GAME GRID (RIGHT) */}
                <div className={`flex-1 relative bg-base-100 rounded-box shadow-xl border border-base-300 p-6 ${gameStatus === 'ended' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    
                    {gameStatus === 'waiting' && (
                        <div className="h-full flex flex-col items-center justify-center border-dashed border-2 border-base-200 rounded-lg">
                            <span className="loading loading-ring loading-lg scale-150 mb-4 text-primary"></span>
                            <p className="opacity-50 mb-8">Waiting for admin to start...</p>
                            {isAdmin && (
                                <button className="btn btn-primary btn-lg px-12 shadow-lg shadow-primary/20 font-black text-2xl tracking-widest hover:scale-105 transition-transform" onClick={() => adminAction("START_GAME", {})}>START GAME</button>
                            )}
                        </div>
                    )}

                    {gameStatus === 'active' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                            {challenges.map((c) => {
                                const isSolved = !isAdmin && mySolves.includes(c.id);
                                return (
                                    <div key={c.id} 
                                         // Allow admin to always click to see stats
                                         onClick={() => (isAdmin || !isSolved) && setSelectedChallenge(c)}
                                         className={`card border-2 transition-all hover:-translate-y-1 cursor-pointer shadow-xl
                                            ${isSolved 
                                                ? "bg-success/10 border-success opacity-60" 
                                                : "bg-base-100 border-base-300 hover:border-primary"}`}
                                    >
                                        <div className="card-body items-center text-center">
                                            <div className="badge badge-ghost mb-2">{c.category}</div>
                                            <h2 className="card-title text-4xl font-black">{c.points}</h2>
                                            <p className="font-bold opacity-75">{c.title}</p>
                                            <div className="badge badge-outline mt-2 text-xs">{c.solves} solves</div>
                                            {isSolved && <div className="badge badge-success font-bold text-white mt-2">SOLVED</div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {gameStatus === 'ended' && showAdminStats && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                            {challenges.map((c) => (
                                <div key={c.id} 
                                        onClick={() => setSelectedChallenge(c)}
                                        className="card border-2 transition-all hover:-translate-y-1 cursor-pointer shadow-xl bg-base-100 border-base-300 hover:border-primary"
                                >
                                    <div className="card-body items-center text-center">
                                        <div className="badge badge-ghost mb-2">{c.category}</div>
                                        <h2 className="card-title text-4xl font-black">{c.points}</h2>
                                        <p className="font-bold opacity-75">{c.title}</p>
                                        <div className="badge badge-outline mt-2 text-xs">{c.solves} solves</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {gameStatus === 'ended' && !showAdminStats && (
                        <div className="h-full flex flex-col items-center justify-center pt-10">
                            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary mb-12 animate-pulse">
                                GAME OVER
                            </h2>
                            <div className="flex items-end gap-4 mb-12">
                                {/* 2nd */}
                                {leaderboard.length > 1 && (
                                    <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-32 h-48 justify-end transition-all ${getRankStyle(1)}`}>
                                        <div className="font-bold text-xl mb-2 truncate max-w-full w-full text-center">{leaderboard[1].name}</div>
                                        <div className="text-3xl font-black">{leaderboard[1].score}</div>
                                        <div className="mt-2 font-mono opacity-50">2ND</div>
                                    </div>
                                )}
                                {/* 1st */}
                                {leaderboard.length > 0 && (
                                    <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-40 h-64 justify-end shadow-2xl shadow-primary/20 transition-all ${getRankStyle(0)}`}>
                                        <div className="text-5xl mb-4">👑</div>
                                        <div className="font-bold text-2xl mb-2 truncate max-w-full w-full text-center">{leaderboard[0].name}</div>
                                        <div className="text-4xl font-black">{leaderboard[0].score}</div>
                                        <div className="mt-2 font-mono font-bold">1ST</div>
                                    </div>
                                )}
                                {/* 3rd */}
                                {leaderboard.length > 2 && (
                                    <div className={`flex flex-col items-center p-4 rounded-t-lg border-t-4 w-32 h-40 justify-end transition-all ${getRankStyle(2)}`}>
                                        <div className="font-bold text-xl mb-2 truncate max-w-full w-full text-center">{leaderboard[2].name}</div>
                                        <div className="text-3xl font-black">{leaderboard[2].score}</div>
                                        <div className="mt-2 font-mono opacity-50">3RD</div>
                                    </div>
                                )}
                            </div>
                            <button className="btn btn-outline btn-wide z-50 px-12" onClick={() => navigate('/')}>Back to Home</button>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL */}
            {selectedChallenge && (
                <div className="modal modal-open bg-black/50 backdrop-blur-sm z-50">
                    <div className="modal-box border border-primary shadow-2xl">
                        <button onClick={() => setSelectedChallenge(null)} className="btn btn-sm btn-circle absolute right-2 top-2">✕</button>
                        <h3 className="text-lg font-bold text-primary">{selectedChallenge.title}</h3>
                        <div className="badge badge-secondary mb-4">{selectedChallenge.points} PTS</div>
                        
                        {/* ADMIN VIEW: SOLVE HISTORY */}
                        {isAdmin ? (
                            <div className="bg-base-200 p-4 rounded-lg my-4 h-64 overflow-y-auto">
                                <h4 className="font-bold opacity-50 text-xs mb-2">SOLVE HISTORY</h4>
                                {selectedChallenge.solve_history && selectedChallenge.solve_history.length > 0 ? (
                                    <ul className="space-y-2">
                                        {selectedChallenge.solve_history.map((log, i) => (
                                            <li key={i} className="flex justify-between text-sm border-b border-base-300 pb-1">
                                                <span>{log.team_name}</span>
                                                <span className="font-mono opacity-50">{log.time_str}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-center opacity-30 mt-10">No solves yet.</div>
                                )}
                            </div>
                        ) : (
                            // PLAYER VIEW: INPUT
                            <>
                                <div className="bg-base-200 p-4 rounded-lg my-4 font-mono text-sm">{selectedChallenge.desc}</div>
                                <div className="join w-full mt-2">
                                    <input className="input input-bordered input-primary join-item w-full font-mono px-4" 
                                        placeholder="format{flag}" value={flagInput} 
                                        onChange={e => setFlagInput(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && submitFlag()} />
                                    <button className="btn btn-primary join-item px-8" onClick={submitFlag}>SUBMIT</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}