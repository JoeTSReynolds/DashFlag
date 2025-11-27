import random
import string
import json
import secrets
import time
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional

# Import our new OOP models
from game_models import Player, Team

app = FastAPI()

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
class ChallengeConfig(BaseModel):
    id: str
    title: str
    category: str
    points: int
    min_points: int
    decay: int
    desc: str
    flag: str

class GameConfig(BaseModel):
    max_team_size: int = 0 
    max_players: int = 0   
    teams_enabled: bool = True 
    challenges: List[ChallengeConfig]
    duration_seconds: int = 1800

# --- GAME MANAGER ---

def generate_code(length=4):
    return ''.join(random.choices(string.ascii_uppercase, k=length))

def generate_team_code():
    return ''.join(random.choices(string.digits, k=4))

class GameManager:
    def __init__(self):
        self.games: Dict[str, dict] = {} 

    def create_game(self, config: GameConfig):
        code = generate_code()
        while code in self.games: code = generate_code()
        
        token = secrets.token_hex(16)
        
        self.games[code] = {
            "status": "waiting",
            "config": config, 
            "admin_token": token,
            "admin_socket": None,
            "teams": {},          
            "socket_map": {},     
            "challenge_stats": {c.id: 0 for c in config.challenges}, 
            "detailed_solves": {c.id: [] for c in config.challenges}, # NEW: Log history
            "start_time": None, # NEW: Track when game started
            "end_time": None
        }
        return code, token

    def calculate_points(self, challenge_config, solve_count):
        drop = solve_count * challenge_config.decay
        current_value = challenge_config.points - drop
        return max(current_value, challenge_config.min_points)

    def format_time(self, seconds):
        m = int(seconds // 60)
        s = int(seconds % 60)
        return f"{m}m {s}s"

    async def broadcast_status(self, game_code: str):
        if game_code not in self.games: return
        game = self.games[game_code]
        
        teams_list = [t.to_dict() for t in game["teams"].values()]
        teams_list.sort(key=lambda x: x["score"], reverse=True)

        # Base challenge payload (for players)
        base_challenges = []
        if game["status"] == "active" or game["status"] == "ended":
            for c in game["config"].challenges:
                solves = game["challenge_stats"].get(c.id, 0)
                current_points = self.calculate_points(c, solves)
                
                base_challenges.append({
                    "id": c.id, 
                    "title": c.title, 
                    "category": c.category, 
                    "points": current_points,
                    "desc": c.desc,
                    "solves": solves,
                    # Players don't get the history log to save bandwidth/prevent cheating
                })

        # Broadcast to Admin (WITH LOGS)
        if game["admin_socket"]:
            admin_challenges = []
            for c in base_challenges:
                # Add history
                c_copy = c.copy()
                c_copy["solve_history"] = game["detailed_solves"].get(c["id"], [])
                admin_challenges.append(c_copy)

            admin_msg = {
                "type": "LOBBY_UPDATE",
                "status": game["status"],
                "leaderboard": teams_list,
                "challenges": admin_challenges,
                "endTime": game["end_time"]
            }
            try: await game["admin_socket"].send_text(json.dumps(admin_msg))
            except: pass

        # Broadcast to Players (WITHOUT LOGS)
        player_msg = {
            "type": "LOBBY_UPDATE",
            "status": game["status"],
            "leaderboard": teams_list,
            "challenges": base_challenges,
            "endTime": game["end_time"]
        }
        
        for team in game["teams"].values():
            for player in team.members.values():
                for sock in player.sockets:
                    try: await sock.send_text(json.dumps(player_msg))
                    except: pass

manager = GameManager()

# --- API ---

@app.post("/create")
async def create_game_endpoint(config: GameConfig):
    code, token = manager.create_game(config)
    return {"gameCode": code, "adminToken": token}

@app.websocket("/ws/{game_code}")
async def websocket_endpoint(websocket: WebSocket, game_code: str):
    await websocket.accept()
    
    if game_code not in manager.games:
        await websocket.send_json({"type": "ERROR", "payload": "INVALID_CODE"})
        await websocket.close()
        return

    game = manager.games[game_code]

    try:
        await websocket.send_json({"type": "CONNECTED_WAITING_AUTH"})
        
        # Helper to clean up socket from previous player if exists
        def remove_socket_from_previous_player(ws):
            old_p_id = game["socket_map"].get(ws)
            if old_p_id:
                for team in game["teams"].values():
                    if old_p_id in team.members:
                        player = team.members[old_p_id]
                        if ws in player.sockets:
                            player.sockets.remove(ws)
                        player.is_connected = len(player.sockets) > 0
                        break
                del game["socket_map"][ws]

        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            msg_type = payload.get("type")

            # --- AUTH ---
            if msg_type == "ADMIN_AUTH":
                if payload.get("token") == game["admin_token"]:
                    game["admin_socket"] = websocket
                    await websocket.send_json({"type": "ADMIN_CONFIRMED"})
                    await manager.broadcast_status(game_code)
                else:
                    await websocket.send_json({"type": "ERROR", "msg": "Invalid Admin Token"})

            if msg_type == "PLAYER_JOIN":
                reconnect_id = payload.get("playerId")
                found_player = None
                found_team = None
                
                if reconnect_id:
                    for team in game["teams"].values():
                        if reconnect_id in team.members:
                            found_player = team.members[reconnect_id]
                            found_team = team
                            break
                
                if found_player:
                    remove_socket_from_previous_player(websocket)
                    found_player.sockets.append(websocket)
                    found_player.is_connected = True
                    game["socket_map"][websocket] = found_player.id
                    await websocket.send_json({
                        "type": "PLAYER_RESTORED", 
                        "playerId": found_player.id,
                        "teamId": found_team.id if not found_team.is_solo else None,
                        "teamName": found_team.name,
                        "isSolo": found_team.is_solo,
                        "solves": found_team.solves
                    })
                    await manager.broadcast_status(game_code)
                else:
                    await websocket.send_json({
                        "type": "READY_TO_PICK_TEAM",
                        "teamsEnabled": game["config"].teams_enabled
                    })

            # --- JOIN / CREATE ---
            if msg_type in ["CREATE_TEAM", "JOIN_TEAM", "JOIN_SOLO"]:
                nickname = payload.get("nickname")
                
                # VALIDATION 1: Player Name
                if any(p.name.lower() == nickname.lower() for t in game["teams"].values() for p in t.members.values()):
                    await websocket.send_json({"type": "TOAST", "msg": "Nickname already taken", "color": "error"})
                    continue

                target_team = None
                
                # VALIDATION 2: Team Logic
                if msg_type == "CREATE_TEAM":
                    if not game["config"].teams_enabled: continue 
                    team_name = payload["teamName"]
                    if any(t.name.lower() == team_name.lower() for t in game["teams"].values()):
                        await websocket.send_json({"type": "TOAST", "msg": "Team name already taken", "color": "error"})
                        continue
                    
                    # Prepare team creation
                    t_id = generate_team_code()
                    new_team = Team(team_name, is_solo=False)
                    new_team.id = t_id
                    target_team = new_team

                elif msg_type == "JOIN_TEAM":
                    if not game["config"].teams_enabled: continue
                    t_code = payload["teamCode"]
                    if t_code not in game["teams"]:
                        await websocket.send_json({"type": "TOAST", "msg": "Team not found", "color": "error"})
                        continue
                    
                    target_team = game["teams"][t_code]
                    if game["config"].max_team_size > 0 and len(target_team.members) >= game["config"].max_team_size:
                        await websocket.send_json({"type": "TOAST", "msg": "Team is full", "color": "error"})
                        continue

                elif msg_type == "JOIN_SOLO":
                    # Check if nickname (team name) is taken by another team
                    if any(t.name.lower() == nickname.lower() for t in game["teams"].values()):
                        await websocket.send_json({"type": "TOAST", "msg": "Name already taken by a team", "color": "error"})
                        continue
                    
                    solo_team = Team(nickname, is_solo=True)
                    solo_team.id = generate_team_code()
                    target_team = solo_team

                # --- COMMIT ---
                new_player = Player(nickname, socket=websocket)
                
                remove_socket_from_previous_player(websocket)
                game["socket_map"][websocket] = new_player.id
                
                # If it's a new team, add it to the game
                if msg_type == "CREATE_TEAM" or msg_type == "JOIN_SOLO":
                    game["teams"][target_team.id] = target_team

                target_team.add_member(new_player)
                
                await websocket.send_json({
                    "type": "PLAYER_CONFIRMED", 
                    "playerId": new_player.id,
                    "teamId": target_team.id,
                    "teamName": target_team.name,
                    "isSolo": target_team.is_solo,
                    "solves": target_team.solves
                })
                await manager.broadcast_status(game_code)

            # --- GAME COMMANDS ---
            if msg_type == "START_GAME" and game["admin_socket"] == websocket:
                game["status"] = "active"
                game["start_time"] = time.time()
                game["end_time"] = time.time() + game["config"].duration_seconds
                game["challenge_stats"] = {c.id: 0 for c in game["config"].challenges}
                # Reset detailed logs
                game["detailed_solves"] = {c.id: [] for c in game["config"].challenges}
                await manager.broadcast_status(game_code)

            if msg_type == "CHECK_TIME":
                if game["status"] == "active" and game["end_time"] and time.time() >= game["end_time"]:
                    game["status"] = "ended"
                    await manager.broadcast_status(game_code)

            if msg_type == "END_GAME" and game["admin_socket"] == websocket:
                game["status"] = "ended"
                game["end_time"] = time.time() 
                await manager.broadcast_status(game_code)

            if msg_type == "KICK_PLAYER" and game["admin_socket"] == websocket:
                p_id = payload.get("playerId")
                for t_id, team in list(game["teams"].items()):
                    if p_id in team.members:
                        victim = team.members[p_id]
                        for sock in victim.sockets:
                            try:
                                await sock.send_json({"type": "KICKED"})
                                await sock.close()
                            except: pass
                        victim.sockets = []
                        team.remove_member(p_id)
                        if not team.members: del game["teams"][t_id]
                        break
                await manager.broadcast_status(game_code)

            if msg_type == "KICK_TEAM" and game["admin_socket"] == websocket:
                t_id = payload.get("teamId")
                if t_id in game["teams"]:
                    team = game["teams"][t_id]
                    for member in team.members.values():
                        for sock in member.sockets:
                            try:
                                await sock.send_json({"type": "KICKED"})
                                await sock.close()
                            except: pass
                        member.sockets = []
                    del game["teams"][t_id]
                await manager.broadcast_status(game_code)

            # --- FLAGS ---
            if msg_type == "SUBMIT_FLAG":
                if game["status"] != "active": continue
                
                p_id = game["socket_map"].get(websocket)
                if not p_id: continue

                player_team = None
                current_player = None
                for team in game["teams"].values():
                    if p_id in team.members:
                        player_team = team
                        current_player = team.members[p_id]
                        break
                
                if not player_team: continue

                chal_id = payload.get("challengeId")
                flag_guess = payload.get("flag")
                challenge_cfg = next((c for c in game["config"].challenges if c.id == chal_id), None)

                if challenge_cfg:
                    if chal_id in player_team.solves: # Check team solves
                        await websocket.send_json({"type": "TOAST", "msg": "You already solved this!", "color": "info"})
                    elif flag_guess == challenge_cfg.flag:
                        solves_count = game["challenge_stats"][chal_id]
                        points = manager.calculate_points(challenge_cfg, solves_count)
                        
                        # Update Stats
                        current_player.score += points
                        player_team.solves.append(chal_id)
                        current_player.solves.append(chal_id)
                        game["challenge_stats"][chal_id] += 1
                        
                        # Log detailed history
                        time_taken = time.time() - game["start_time"]
                        log_entry = {
                            "team_name": player_team.name,
                            "time_str": manager.format_time(time_taken)
                        }
                        game["detailed_solves"][chal_id].append(log_entry)
                        
                        for member in player_team.members.values():
                            for sock in member.sockets:
                                try:
                                    await sock.send_json({"type": "TOAST", "msg": f"{current_player.name} solved {challenge_cfg.title}! +{points}", "color": "success"})
                                    if member.id == current_player.id:
                                        await sock.send_json({"type": "SOLVE_CONFIRMED", "id": chal_id})
                                except: pass

                        if solves_count == 0:
                             for ws in game["socket_map"]:
                                 try: await ws.send_json({"type": "TOAST", "msg": f"FIRST BLOOD: {player_team.name} solved {challenge_cfg.title}!", "color": "error"})
                                 except: pass

                        await manager.broadcast_status(game_code)
                    else:
                        await websocket.send_json({"type": "TOAST", "msg": "Incorrect Flag", "color": "error"})

            if msg_type == "LEAVE_GAME":
                p_id = game["socket_map"].get(websocket)
                if p_id:
                    # If game ended, treat leave as disconnect (preserve state)
                    if game["status"] == "ended":
                        for team in game["teams"].values():
                            if p_id in team.members:
                                player = team.members[p_id]
                                if websocket in player.sockets:
                                    player.sockets.remove(websocket)
                                player.is_connected = len(player.sockets) > 0
                                break
                        if websocket in game["socket_map"]:
                            del game["socket_map"][websocket]
                        await websocket.close()
                        await manager.broadcast_status(game_code)
                        break

                    for t_id, team in list(game["teams"].items()):
                        if p_id in team.members:
                            # Notify other sockets of this player that they left
                            player = team.members[p_id]
                            for sock in player.sockets:
                                if sock != websocket:
                                    try:
                                        await sock.send_json({"type": "KICKED"}) # Reuse KICKED to force reload/home
                                        await sock.close()
                                    except: pass
                            player.sockets = []
                            
                            team.remove_member(p_id)
                            if not team.members: del game["teams"][t_id]
                            break
                    del game["socket_map"][websocket]
                await websocket.close()
                await manager.broadcast_status(game_code)
                break

    except WebSocketDisconnect:
        p_id = game.get("socket_map", {}).get(websocket)
        if p_id:
            for team in game["teams"].values():
                if p_id in team.members:
                    player = team.members[p_id]
                    if websocket in player.sockets:
                        player.sockets.remove(websocket)
                    player.is_connected = len(player.sockets) > 0
                    break
            if websocket in game["socket_map"]:
                del game["socket_map"][websocket]
        
        if game["admin_socket"] == websocket:
            game["admin_socket"] = None
            
        await manager.broadcast_status(game_code)