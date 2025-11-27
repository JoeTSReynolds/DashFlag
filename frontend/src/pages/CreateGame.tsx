import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Default Challenges
const DEFAULT_CHALLENGES = [
    {id: "misc1", title: "Sanity Check", category: "MISC", points: 100, min_points: 100, decay: 0, desc: "The flag is format{welcome}", flag: "format{welcome}"},
    {id: "web1", title: "Inspector Gadget", category: "WEB", points: 500, min_points: 100, decay: 50, desc: "Check the HTML comments.", flag: "format{html_master}"},
    {id: "crypto1", title: "Caesar Salad", category: "CRYPTO", points: 400, min_points: 100, decay: 30, desc: "Rot13 is classic.", flag: "format{rot13_is_easy}"},
    {id: "bin1", title: "Buffer Ouch", category: "PWN", points: 800, min_points: 200, decay: 100, desc: "Overflow the buffer.", flag: "format{segfault}"},
]

export default function CreateGame() {
  const navigate = useNavigate()
  const [maxTeamSize, setMaxTeamSize] = useState(0) // 0 = unlimited
  const [teamsEnabled, setTeamsEnabled] = useState(true) 
  const [challenges, setChallenges] = useState(DEFAULT_CHALLENGES)
  const [loading, setLoading] = useState(false)
  
  // Duration State
  const [days, setDays] = useState(0)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)

  const updateChallenge = (index: number, field: string, value: any) => {
      const newChals = [...challenges]
      newChals[index] = { ...newChals[index], [field]: value }
      setChallenges(newChals)
  }

  const handleCreate = async () => {
      setLoading(true)
      try {
          const totalSeconds = (days * 24 * 3600) + (hours * 3600) + (minutes * 60)
          const payload = {
              max_team_size: teamsEnabled ? maxTeamSize : 1,
              max_players: 0,
              teams_enabled: teamsEnabled,
              challenges: challenges,
              duration_seconds: totalSeconds > 0 ? totalSeconds : 1800
          }
          
          const response = await fetch("http://localhost:8000/create", { 
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          })
          const data = await response.json()
          
          localStorage.setItem(`dashflag_admin_${data.gameCode}`, data.adminToken)
          navigate(`/lobby/${data.gameCode}`)
      } catch (e) {
          alert("Error creating game")
      } finally {
          setLoading(false)
      }
  }

  return (
    <div className="min-h-screen bg-base-200 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-primary">Configure CTF</h1>
        
        {/* SETTINGS CARD */}
        <div className="card bg-base-100 shadow-xl mb-8">
            <div className="card-body">
                <h2 className="card-title">General Settings</h2>
                
                <div className="form-control bg-base-200 p-4 rounded-lg border border-base-300">
                    <label className="label cursor-pointer justify-between">
                        <span className="label-text font-bold text-lg">Enable Teams</span> 
                        <input type="checkbox" className={`toggle toggle-lg ${teamsEnabled ? 'toggle-success' : 'toggle-error bg-base-100'}`} 
                            checked={teamsEnabled} onChange={e => setTeamsEnabled(e.target.checked)} />
                    </label>
                    <span className="label-text-alt px-1 opacity-70">
                        {teamsEnabled ? "Players can join or create teams." : "Every player is on their own (Solo Mode)."}
                    </span>
                </div>

                <div className="form-control mt-4">
                    <label className="label"><span className="label-text font-bold">Game Duration</span></label>
                    <div className="flex gap-4">
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text-alt">Days</span></label>
                            <input type="number" min="0" className="input input-bordered" value={days} onChange={e => setDays(Math.max(0, parseInt(e.target.value) || 0))} />
                        </div>
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text-alt">Hours (Max 24)</span></label>
                            <input type="number" min="0" max="24" className="input input-bordered" value={hours} onChange={e => setHours(Math.min(24, Math.max(0, parseInt(e.target.value) || 0)))} />
                        </div>
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text-alt">Minutes (Max 60)</span></label>
                            <input type="number" min="0" max="60" className="input input-bordered" value={minutes} onChange={e => setMinutes(Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))} />
                        </div>
                    </div>
                </div>

                {teamsEnabled && (
                    <div className="form-control w-full max-w-xs mt-4">
                        <label className="label"><span className="label-text">Max Team Size (0 = Unlimited)</span></label>
                        <input type="number" className="input input-bordered" value={maxTeamSize} onChange={e => setMaxTeamSize(parseInt(e.target.value))} />
                    </div>
                )}
            </div>
        </div>

        {/* CHALLENGES CARD */}
        <div className="card bg-base-100 shadow-xl mb-8">
            <div className="card-body">
                <h2 className="card-title mb-4">Challenge Library</h2>
                <div className="space-y-4">
                    {challenges.map((c, i) => (
                        <div key={c.id} className="collapse collapse-arrow border border-base-300 bg-base-100 rounded-box">
                            <input type="checkbox" /> 
                            <div className="collapse-title text-xl font-medium flex justify-between">
                                <span>{c.title} <span className="badge badge-sm">{c.category}</span></span>
                                <span className="font-mono">{c.points} pts</span>
                            </div>
                            <div className="collapse-content bg-base-200 pt-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="form-control">
                                        <label className="label"><span className="label-text-alt">Points</span></label>
                                        <input type="number" className="input input-sm input-bordered" 
                                            value={c.points} onChange={e => updateChallenge(i, 'points', parseInt(e.target.value))} />
                                    </div>
                                    <div className="form-control">
                                        <label className="label"><span className="label-text-alt">Decay Rate</span></label>
                                        <input type="number" className="input input-sm input-bordered" 
                                            value={c.decay} onChange={e => updateChallenge(i, 'decay', parseInt(e.target.value))} />
                                    </div>
                                    <div className="form-control">
                                        <label className="label"><span className="label-text-alt">Min Points</span></label>
                                        <input type="number" className="input input-sm input-bordered" 
                                            value={c.min_points} onChange={e => updateChallenge(i, 'min_points', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <div className="form-control mt-2">
                                    <label className="label"><span className="label-text-alt">Description</span></label>
                                    <textarea className="textarea textarea-bordered h-24" 
                                        value={c.desc} onChange={e => updateChallenge(i, 'desc', e.target.value)}></textarea>
                                </div>
                                <div className="form-control mt-2">
                                    <label className="label"><span className="label-text-alt">Flag</span></label>
                                    <input type="text" className="input input-sm input-bordered font-mono" 
                                        value={c.flag} onChange={e => updateChallenge(i, 'flag', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <button className={`btn btn-primary btn-lg w-full ${loading ? 'loading' : ''}`} onClick={handleCreate}>
            LAUNCH GAME SERVER
        </button>
      </div>
    </div>
  )
}