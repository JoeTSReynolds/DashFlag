import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPaperclip } from '@fortawesome/free-solid-svg-icons'

interface Hint {
    id: string
    content: string
    cost: number
}

interface Challenge {
    id: string
    title: string
    category: string
    points: number
    min_points: number
    decay: number
    desc: string
    flag: string
    files: string[]
    hints: Hint[]
    is_premade: boolean
}

export default function CreateGame() {
  const navigate = useNavigate()
  const [maxTeamSize, setMaxTeamSize] = useState(0) // 0 = unlimited
  const [teamsEnabled, setTeamsEnabled] = useState(true) 
  const [selectedChallenges, setSelectedChallenges] = useState<Challenge[]>([])
  const [premadeChallenges, setPremadeChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
      const fetchPremade = async () => {
          try {
              const apiUrl = import.meta.env.VITE_API_URL || ''
              const res = await fetch(`${apiUrl}/api/premade-challenges`, {
                  headers: { "ngrok-skip-browser-warning": "true" }
              })
              if (res.ok) {
                  const data = await res.json()
                  setPremadeChallenges(data)
              }
          } catch (e) {
              console.error("Failed to fetch premade challenges", e)
          }
      }
      fetchPremade()
  }, [])
  
  // Editing State
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Duration State
  const [days, setDays] = useState(0)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)

  const addCustomChallenge = () => {
      const newChal: Challenge = {
          id: `custom_${Date.now()}`,
          title: "New Challenge",
          category: "MISC",
          points: 100,
          min_points: 100,
          decay: 0,
          desc: "Description here...",
          flag: "format{flag}",
          files: [],
          hints: [],
          is_premade: false
      }
      setEditingChallenge(newChal)
      setIsEditModalOpen(true)
  }

  const saveChallenge = () => {
      if (!editingChallenge) return

      if (!editingChallenge.is_premade) {
          const flagRegex = /^[a-zA-Z0-9_-]+{[a-zA-Z0-9_-]+}$/
          if (!flagRegex.test(editingChallenge.flag)) {
              alert("Invalid Flag Format!\nMust be: prefix{content}\n- Prefix: Alphanumeric, _, -\n- Content: Alphanumeric, _, -\n- Both must be non-empty.")
              return
          }
      }
      
      setSelectedChallenges(prev => {
          const exists = prev.find(c => c.id === editingChallenge.id)
          if (exists) {
              return prev.map(c => c.id === editingChallenge.id ? editingChallenge : c)
          } else {
              return [...prev, editingChallenge]
          }
      })
      setIsEditModalOpen(false)
      setEditingChallenge(null)
  }

  const deleteChallenge = (id: string) => {
      setSelectedChallenges(prev => prev.filter(c => c.id !== id))
  }

  const togglePremade = (premade: Challenge) => {
      const exists = selectedChallenges.find(c => c.id === premade.id)
      if (exists) {
          deleteChallenge(premade.id)
      } else {
          setSelectedChallenges(prev => [...prev, premade])
      }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !editingChallenge) return
      const file = e.target.files[0]
      const formData = new FormData()
      formData.append('file', file)

      try {
          const apiUrl = import.meta.env.VITE_API_URL || ''
          const res = await fetch(`${apiUrl}/api/upload`, {
              method: 'POST',
              headers: { "ngrok-skip-browser-warning": "true" },
              body: formData
          })
          
          if (!res.ok) {
              const err = await res.json()
              alert(`Upload failed: ${JSON.stringify(err)}`)
              return
          }

          const data = await res.json()
          setEditingChallenge(prev => prev ? ({...prev, files: [...prev.files, data.url]}) : null)
      } catch (err) {
          console.error(err)
          alert("Upload failed: Network error")
      }
  }

  const handleCreate = async () => {
      setLoading(true)
      try {
          const totalSeconds = (days * 24 * 3600) + (hours * 3600) + (minutes * 60)
          const payload = {
              max_team_size: teamsEnabled ? maxTeamSize : 1,
              max_players: 0,
              teams_enabled: teamsEnabled,
              challenges: selectedChallenges,
              duration_seconds: totalSeconds > 0 ? totalSeconds : 1800
          }
          
          // Use relative path so it goes through Vite proxy (works for localhost and ngrok)
          const apiUrl = import.meta.env.VITE_API_URL || ''
          const response = await fetch(`${apiUrl}/api/create`, { 
              method: "POST",
              headers: { 
                  "Content-Type": "application/json",
                  "ngrok-skip-browser-warning": "true"
              },
              body: JSON.stringify(payload)
          })

          if (!response.ok) {
              const err = await response.json()
              alert(`Server Error: ${JSON.stringify(err)}`)
              setLoading(false)
              return
          }

          const data = await response.json()
          
          if (!data.gameCode) {
              alert("Invalid server response")
              setLoading(false)
              return
          }

          localStorage.setItem(`dashflag_admin_${data.gameCode}`, data.adminToken)
          navigate(`/lobby/${data.gameCode}`)
      } catch (e) {
          console.error(e)
          alert(`Error creating game: ${e}`)
      } finally {
          setLoading(false)
      }
  }

  return (
    <div className="min-h-screen bg-base-200 p-8">
      <div className="max-w-6xl mx-auto">
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
                            <input type="number" min="0" className="input input-bordered px-4 w-full" value={days} onChange={e => setDays(Math.max(0, parseInt(e.target.value) || 0))} />
                        </div>
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text-alt">Hours (Max 24)</span></label>
                            <input type="number" min="0" max="24" className="input input-bordered px-4 w-full" value={hours} onChange={e => setHours(Math.min(24, Math.max(0, parseInt(e.target.value) || 0)))} />
                        </div>
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text-alt">Minutes (Max 60)</span></label>
                            <input type="number" min="0" max="60" className="input input-bordered px-4 w-full" value={minutes} onChange={e => setMinutes(Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))} />
                        </div>
                    </div>
                </div>

                {teamsEnabled && (
                    <div className="form-control w-full max-w-xs mt-4">
                        <label className="label"><span className="label-text">Max Team Size (0 = Unlimited)</span></label>
                        <input type="number" className="input input-bordered px-4 w-full" value={maxTeamSize} onChange={e => setMaxTeamSize(parseInt(e.target.value))} />
                    </div>
                )}
            </div>
        </div>

        {/* SELECTED CHALLENGES */}
        <div className="card bg-base-100 shadow-xl mb-8">
            <div className="card-body">
                <h2 className="card-title mb-4">Selected Challenges ({selectedChallenges.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* ADD BUTTON */}
                    <div onClick={addCustomChallenge} className="card border-2 border-dashed border-base-300 hover:border-primary cursor-pointer flex items-center justify-center min-h-[200px] transition-all hover:bg-base-200">
                        <span className="text-6xl text-base-300">+</span>
                        <span className="font-bold mt-2 text-base-content/50">Add Custom</span>
                    </div>

                    {/* CARDS */}
                    {selectedChallenges.map((c) => (
                        <div key={c.id} className="card bg-base-200 border border-base-300 shadow-sm">
                            <div className="card-body p-4">
                                <div className="flex justify-between items-start">
                                    <div className="badge badge-primary">{c.category}</div>
                                    <div className="font-mono font-bold">{c.points} pts</div>
                                </div>
                                <h3 className="font-bold text-lg mt-2">{c.title}</h3>
                                <p className="text-xs opacity-70 truncate">{c.desc}</p>
                                <div className="card-actions justify-end mt-4">
                                    <button className="btn btn-sm btn-ghost px-4" onClick={() => {
                                        setEditingChallenge(c)
                                        setIsEditModalOpen(true)
                                    }}>Edit</button>
                                    <button className="btn btn-sm btn-error btn-outline px-4" onClick={() => deleteChallenge(c.id)}>Delete</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* PRE-MADE LIBRARY */}
        <div className="card bg-base-100 shadow-xl mb-8 opacity-90">
            <div className="card-body">
                <h2 className="card-title mb-4">Pre-made Library</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {premadeChallenges.map((c) => {
                        const isSelected = selectedChallenges.some(sc => sc.id === c.id)
                        return (
                            <div key={c.id} 
                                onClick={() => !isSelected && togglePremade(c)}
                                className={`card border border-base-300 cursor-pointer transition-all hover:-translate-y-1
                                    ${isSelected ? 'opacity-40 grayscale cursor-not-allowed bg-base-200' : 'bg-base-100 hover:border-primary shadow-sm'}`}
                            >
                                <div className="card-body p-4">
                                    <div className="badge badge-ghost">{c.category}</div>
                                    <h3 className="font-bold">{c.title}</h3>
                                    <div className="font-mono text-sm opacity-50">{c.points} pts</div>
                                    {isSelected && <div className="badge badge-success mt-2">ADDED</div>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>

        <button className={`btn btn-primary btn-lg w-full ${loading ? 'loading' : ''}`} onClick={handleCreate}>
            LAUNCH GAME SERVER
        </button>

        {/* EDIT MODAL */}
        {isEditModalOpen && editingChallenge && (
            <div className="modal modal-open bg-black/50">
                <div className="modal-box w-11/12 max-w-3xl">
                    <h3 className="font-bold text-lg mb-4">
                        {editingChallenge.is_premade ? `Edit Scoring: ${editingChallenge.title}` : "Edit Challenge"}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* LEFT COL: META */}
                        <div className="space-y-4">
                            {!editingChallenge.is_premade && (
                                <>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Title</span></label>
                                        <input className="input input-bordered w-full" value={editingChallenge.title} 
                                            onChange={e => setEditingChallenge({...editingChallenge, title: e.target.value})} />
                                    </div>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Category</span></label>
                                        <select className="select select-bordered w-full" value={editingChallenge.category}
                                            onChange={e => setEditingChallenge({...editingChallenge, category: e.target.value})}>
                                            <option>MISC</option><option>WEB</option><option>CRYPTO</option><option>PWN</option><option>REV</option><option>OSINT</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            
                            <div className="grid grid-cols-3 gap-2">
                                <div className="form-control w-full">
                                    <label className="label"><span className="label-text-alt">Points</span></label>
                                    <input type="number" className="input input-bordered px-2 w-full" value={editingChallenge.points} 
                                        onChange={e => setEditingChallenge({...editingChallenge, points: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="form-control w-full">
                                    <label className="label"><span className="label-text-alt">Decay</span></label>
                                    <input type="number" className="input input-bordered px-2 w-full" value={editingChallenge.decay} 
                                        onChange={e => setEditingChallenge({...editingChallenge, decay: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="form-control w-full">
                                    <label className="label"><span className="label-text-alt">Min</span></label>
                                    <input type="number" className="input input-bordered px-2 w-full" value={editingChallenge.min_points} 
                                        onChange={e => setEditingChallenge({...editingChallenge, min_points: parseInt(e.target.value) || 0})} />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COL: CONTENT */}
                        <div className="space-y-4">
                            {!editingChallenge.is_premade && (
                                <>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Description</span></label>
                                        <textarea className="textarea textarea-bordered h-24 w-full" value={editingChallenge.desc} 
                                            onChange={e => setEditingChallenge({...editingChallenge, desc: e.target.value})}></textarea>
                                    </div>
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Flag</span></label>
                                        <input className="input input-bordered font-mono w-full" value={editingChallenge.flag} 
                                            onChange={e => setEditingChallenge({...editingChallenge, flag: e.target.value})} />
                                    </div>
                                    
                                    {/* FILES */}
                                    <div className="form-control w-full">
                                        <label className="label"><span className="label-text">Files</span></label>
                                        <input type="file" className="file-input file-input-bordered w-full" onChange={handleFileUpload} />
                                        <div className="mt-2 space-y-1">
                                            {editingChallenge.files.map((f, i) => {
                                                const fileName = f.split('/').pop() || 'file'
                                                // Check if it's a custom name format: "REALNAME|URL"
                                                const parts = f.split('|')
                                                const displayName = parts.length > 1 ? parts[0] : fileName
                                                
                                                return (
                                                    <div key={i} className="badge badge-outline gap-2 w-full justify-between p-4 h-auto">
                                                        <div className="flex items-center gap-2 flex-1">
                                                            <span className="opacity-50"><FontAwesomeIcon icon={faPaperclip} /></span>
                                                            <input 
                                                                className="input input-ghost input-xs w-full max-w-[200px] focus:bg-base-200" 
                                                                value={displayName}
                                                                onChange={(e) => {
                                                                    const newName = e.target.value
                                                                    const url = parts.length > 1 ? parts[1] : f
                                                                    const newEntry = `${newName}|${url}`
                                                                    const newFiles = [...editingChallenge.files]
                                                                    newFiles[i] = newEntry
                                                                    setEditingChallenge({...editingChallenge, files: newFiles})
                                                                }}
                                                            />
                                                        </div>
                                                        <button onClick={() => setEditingChallenge({...editingChallenge, files: editingChallenge.files.filter((_, idx) => idx !== i)})} className="btn btn-ghost btn-xs">✕</button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            {/* HINTS SECTION (Available for both custom and premade) */}
                            <div className="divider">Hints</div>
                            <div className="space-y-2">
                                {editingChallenge.hints?.map((h, i) => (
                                    <div key={h.id} className="card bg-base-200 p-2 border border-base-300">
                                        <div className="flex gap-2 mb-2">
                                            <div className="form-control w-24">
                                                <label className="label py-0"><span className="label-text-alt">Cost</span></label>
                                                <input type="number" min="0" className="input input-bordered input-xs" value={h.cost} 
                                                    onChange={e => {
                                                        const newHints = [...(editingChallenge.hints || [])]
                                                        newHints[i] = {...h, cost: Math.max(0, parseInt(e.target.value) || 0)}
                                                        setEditingChallenge({...editingChallenge, hints: newHints})
                                                    }} />
                                            </div>
                                            {!editingChallenge.is_premade && (
                                                <button className="btn btn-xs btn-ghost text-error ml-auto" onClick={() => {
                                                    const newHints = editingChallenge.hints.filter((_, idx) => idx !== i)
                                                    setEditingChallenge({...editingChallenge, hints: newHints})
                                                }}>Remove</button>
                                            )}
                                        </div>
                                        <textarea className="textarea textarea-bordered textarea-xs w-full" 
                                            placeholder="Hint content..."
                                            value={h.content}
                                            disabled={editingChallenge.is_premade}
                                            onChange={e => {
                                                const newHints = [...(editingChallenge.hints || [])]
                                                newHints[i] = {...h, content: e.target.value}
                                                setEditingChallenge({...editingChallenge, hints: newHints})
                                            }}
                                        ></textarea>
                                    </div>
                                ))}
                                {!editingChallenge.is_premade && (
                                    <button className="btn btn-sm btn-outline w-full border-dashed" onClick={() => {
                                        const newHint: Hint = { id: `h_${Date.now()}`, content: "", cost: 50 }
                                        setEditingChallenge({...editingChallenge, hints: [...(editingChallenge.hints || []), newHint]})
                                    }}>+ Add Hint</button>
                                )}
                            </div>

                            {editingChallenge.is_premade && (
                                <div className="alert alert-info text-xs">
                                    <span>Content for pre-made challenges cannot be edited. Only scoring values can be adjusted.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="modal-action">
                        <button className="btn px-6" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                        <button className="btn btn-primary px-6" onClick={saveChallenge}>Save</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}