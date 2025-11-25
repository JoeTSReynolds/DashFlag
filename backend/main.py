import random
import string
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
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

# --- GAME MANAGEMENT LOGIC ---

def generate_code(length=4):
    """Generates a random 4-letter code (e.g., ABCD)"""
    return ''.join(random.choices(string.ascii_uppercase, k=length))

class GameManager:
    def __init__(self):
        # Stores game state: { "ABCD": { "state": "waiting", "players": [], "admin": socket } }
        self.games: Dict[str, dict] = {} 

    def create_game(self):
        code = generate_code()
        while code in self.games: # Ensure uniqueness
            code = generate_code()
        
        self.games[code] = {
            "status": "waiting", # waiting, active, ended
            "players": {},       # { "socket_object": "nickname" }
            "admin": None        # The host's websocket
        }
        return code

    async def connect_player(self, websocket: WebSocket, game_code: str):
        await websocket.accept()
        
        # Check validity
        if game_code not in self.games:
            await websocket.send_json({"type": "ERROR", "payload": "INVALID_CODE"})
            await websocket.close()
            return False
        
        self.games[game_code]["players"][websocket] = "Anonymous" 
        return True

    def remove_player(self, websocket: WebSocket, game_code: str):
        if game_code in self.games and websocket in self.games[game_code]["players"]:
            del self.games[game_code]["players"][websocket]
            # If admin leaves, maybe pause game? For now, ignore.

    async def broadcast_status(self, game_code: str):
        """Sends the current player list and status to everyone in the room"""
        if game_code not in self.games:
            return

        game = self.games[game_code]
        # Create a list of player names
        player_list = list(game["players"].values())
        
        message = {
            "type": "LOBBY_UPDATE",
            "status": game["status"],
            "players": player_list,
            "count": len(player_list)
        }
        
        # Send to all players
        for socket in game["players"]:
            try:
                await socket.send_text(json.dumps(message))
            except:
                pass # Handle dead sockets later

manager = GameManager()

# --- API ENDPOINTS ---

@app.post("/create")
async def create_game_endpoint():
    """Host clicks 'Create Game', we give them a code"""
    code = manager.create_game()
    return {"gameCode": code}

@app.websocket("/ws/{game_code}")
async def websocket_endpoint(websocket: WebSocket, game_code: str):
    success = await manager.connect_player(websocket, game_code)
    if not success:
        return # Connection rejected

    try:
        # 1. Send immediate update upon joining
        await manager.broadcast_status(game_code)
        
        while True:
            # 2. Listen for messages (JSON format)
            data = await websocket.receive_text()
            payload = json.loads(data)

            # Handle "Set Nickname"
            if payload.get("type") == "JOIN":
                manager.games[game_code]["players"][websocket] = payload["nickname"]
                await manager.broadcast_status(game_code)

    except WebSocketDisconnect:
        manager.remove_player(websocket, game_code)
        await manager.broadcast_status(game_code)