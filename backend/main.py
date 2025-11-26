import random
import string
import json
import secrets
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CHALLENGE LIBRARY ---
# Added 'min_points' and 'decay' to config
CHALLENGE_LIBRARY = [
    {"id": "misc1", "title": "Sanity Check", "category": "MISC", "points": 100, "min_points": 100, "decay": 0, "desc": "The flag is format{welcome}", "flag": "format{welcome}"},
    {"id": "web1", "title": "Inspector Gadget", "category": "WEB", "points": 500, "min_points": 100, "decay": 50, "desc": "Check the HTML comments.", "flag": "format{html_master}"},
    {"id": "crypto1", "title": "Caesar Salad", "category": "CRYPTO", "points": 400, "min_points": 100, "decay": 30, "desc": "Rot13 is classic.", "flag": "format{rot13_is_easy}"},
    {"id": "bin1", "title": "Buffer Ouch", "category": "PWN", "points": 800, "min_points": 200, "decay": 100, "desc": "Overflow the buffer.", "flag": "format{segfault}"},
]

def generate_code(length=4):
    return ''.join(random.choices(string.ascii_uppercase, k=length))

class GameManager:
    def __init__(self):
        self.games: Dict[str, dict] = {} 

    def create_game(self):
        code = generate_code()
        while code in self.games:
            code = generate_code()
        
        token = secrets.token_hex(16)
        
        self.games[code] = {
            "status": "waiting",
            "admin_token": token,
            "admin_socket": None,
            "players": {},       # {ws: nickname}
            "scores": {},        # {ws: 0}
            "solves": {},        # {ws: ["misc1"]} -> List of solved IDs
            "challenge_stats": {}, # {chal_id: count_of_solves} -> NEW: Track solve counts
            "challenges": [],   
            "end_time": None
        }
        return code, token

    async def connect_player(self, websocket: WebSocket, game_code: str):
        await websocket.accept()
        if game_code not in self.games:
            await websocket.send_json({"type": "ERROR", "payload": "INVALID_CODE"})
            await websocket.close()
            return False
        
        self.games[game_code]["players"][websocket] = "Anonymous"
        self.games[game_code]["scores"][websocket] = 0
        self.games[game_code]["solves"][websocket] = []
        return True

    def remove_player(self, websocket: WebSocket, game_code: str):
        if game_code in self.games:
            game = self.games[game_code]
            if game["admin_socket"] == websocket:
                game["admin_socket"] = None
            if websocket in game["players"]:
                del game["players"][websocket]

    def calculate_points(self, challenge, solve_count):
        """ Dynamic Scoring Algorithm """
        # If it's the first solve (solve_count is 0 *before* this one), they get max points
        # But typically decay happens AFTER the first solve. 
        # Let's say: 1st person gets Max. 2nd person gets Max - Decay.
        
        drop = solve_count * challenge["decay"]
        current_value = challenge["points"] - drop
        return max(current_value, challenge["min_points"])

    async def broadcast_status(self, game_code: str):
        if game_code not in self.games: return

        game = self.games[game_code]
        
        # 1. Build Leaderboard
        leaderboard = []
        for ws, name in game["players"].items():
            leaderboard.append({
                "name": name,
                "score": game["scores"].get(ws, 0),
                "solves": game["solves"].get(ws, [])
            })
        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        # 2. Prepare Challenges with DYNAMIC POINTS
        challenges_payload = []
        if game["status"] == "active":
            for c in game["challenges"]:
                solves = game["challenge_stats"].get(c["id"], 0)
                current_points = self.calculate_points(c, solves)
                
                challenges_payload.append({
                    "id": c["id"], 
                    "title": c["title"], 
                    "category": c["category"], 
                    "points": current_points, # Send the DECAYED value
                    "desc": c["desc"],
                    "solves": solves # Send solve count so UI can show it
                })

        message = {
            "type": "LOBBY_UPDATE",
            "status": game["status"],
            "leaderboard": leaderboard,
            "challenges": challenges_payload,
            "endTime": game["end_time"]
        }
        
        for socket in game["players"]:
            try:
                await socket.send_text(json.dumps(message))
            except:
                pass

manager = GameManager()

# --- API ---

@app.post("/create")
async def create_game_endpoint():
    code, token = manager.create_game()
    return {"gameCode": code, "adminToken": token}

@app.websocket("/ws/{game_code}")
async def websocket_endpoint(websocket: WebSocket, game_code: str):
    if not await manager.connect_player(websocket, game_code): return

    try:
        await manager.broadcast_status(game_code)
        
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            # JOIN
            if payload.get("type") == "JOIN":
                nickname = payload["nickname"]
                admin_token = payload.get("adminToken")
                game = manager.games[game_code]
                
                is_admin = False
                if admin_token and admin_token == game["admin_token"]:
                    is_admin = True
                    game["admin_socket"] = websocket
                    nickname = f"★ {nickname}" 

                game["players"][websocket] = nickname
                if is_admin: await websocket.send_json({"type": "ADMIN_CONFIRMED"})
                await manager.broadcast_status(game_code)

            # START GAME
            if payload.get("type") == "START_GAME":
                game = manager.games[game_code]
                if game["admin_socket"] == websocket:
                    game["challenges"] = CHALLENGE_LIBRARY
                    game["end_time"] = time.time() + (30 * 60) 
                    # Reset stats
                    game["challenge_stats"] = {c["id"]: 0 for c in CHALLENGE_LIBRARY}
                    game["status"] = "active"
                    await manager.broadcast_status(game_code)

            # END GAME
            if payload.get("type") == "END_GAME":
                game = manager.games[game_code]
                if game["admin_socket"] == websocket:
                    game["status"] = "ended"
                    game["end_time"] = time.time() 
                    await manager.broadcast_status(game_code)

            # SUBMIT FLAG
            if payload.get("type") == "SUBMIT_FLAG":
                chal_id = payload.get("challengeId")
                flag_guess = payload.get("flag")
                game = manager.games[game_code]

                if game["status"] == "ended" or (game["end_time"] and time.time() > game["end_time"]):
                    await websocket.send_json({"type": "TOAST", "msg": "Game is over!", "color": "warning"})
                    continue

                challenge = next((c for c in game["challenges"] if c["id"] == chal_id), None)
                
                if challenge:
                    if chal_id in game["solves"][websocket]:
                         await websocket.send_json({"type": "TOAST", "msg": "Already solved!", "color": "info"})
                    
                    elif flag_guess == challenge["flag"]:
                        # Calculate Points based on CURRENT solve count
                        solves_before_me = game["challenge_stats"][chal_id]
                        points_earned = manager.calculate_points(challenge, solves_before_me)
                        
                        # Update Player Score
                        game["scores"][websocket] += points_earned
                        game["solves"][websocket].append(chal_id)
                        
                        # Update Global Solve Count (So next person gets less)
                        game["challenge_stats"][chal_id] += 1
                        
                        # Notify
                        await websocket.send_json({"type": "TOAST", "msg": f"Correct! +{points_earned}", "color": "success"})
                        await websocket.send_json({"type": "SOLVE_CONFIRMED", "id": chal_id})
                        
                        # 5. First Blood Bonus? (Visual only for now)
                        if solves_before_me == 0:
                             # Broadcast First Blood Event to everyone
                             for socket in game["players"]:
                                 await socket.send_json({
                                     "type": "TOAST", 
                                     "msg": f"FIRST BLOOD: {game['players'][websocket]} solved {challenge['title']}!", 
                                     "color": "error" # Red for First Blood
                                 })

                        await manager.broadcast_status(game_code)
                    else:
                        await websocket.send_json({"type": "TOAST", "msg": "Incorrect Flag", "color": "error"})

    except WebSocketDisconnect:
        manager.remove_player(websocket, game_code)
        await manager.broadcast_status(game_code)