import random
import secrets
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
    return ''.join(random.choices(string.ascii_uppercase, k=length))

class GameManager:
    def __init__(self):
        self.games: Dict[str, dict] = {} 

    def create_game(self):
        code = generate_code()
        while code in self.games:
            code = generate_code()
        
        # Generate a secret token for the admin
        token = secrets.token_hex(16)
        
        self.games[code] = {
            "status": "waiting",
            "admin_token": token,
            "admin_socket": None,
            "players": {}
        }
        # Return BOTH code and token
        return code, token

    async def connect_player(self, websocket: WebSocket, game_code: str):
        await websocket.accept()
        
        if game_code not in self.games:
            await websocket.send_json({"type": "ERROR", "payload": "INVALID_CODE"})
            await websocket.close()
            return False
        
        self.games[game_code]["players"][websocket] = "Anonymous"
        return True

    def remove_player(self, websocket: WebSocket, game_code: str):
        if game_code in self.games:
            # If admin leaves, clear the admin_socket reference
            if self.games[game_code]["admin_socket"] == websocket:
                self.games[game_code]["admin_socket"] = None
            
            if websocket in self.games[game_code]["players"]:
                del self.games[game_code]["players"][websocket]

    async def broadcast_status(self, game_code: str):
        if game_code not in self.games:
            return

        game = self.games[game_code]
        player_list = list(game["players"].values())
        
        message = {
            "type": "LOBBY_UPDATE",
            "status": game["status"],
            "players": player_list,
        }
        
        for socket in game["players"]:
            try:
                await socket.send_text(json.dumps(message))
            except:
                pass

manager = GameManager()

# --- API ENDPOINTS ---

@app.post("/create")
async def create_game_endpoint():
    code, token = manager.create_game()
    # Return the secret token to the host
    return {"gameCode": code, "adminToken": token}

@app.websocket("/ws/{game_code}")
async def websocket_endpoint(websocket: WebSocket, game_code: str):
    success = await manager.connect_player(websocket, game_code)
    if not success: return

    try:
        await manager.broadcast_status(game_code)
        
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            # HANDLE JOIN (Check for Admin Token)
            if payload.get("type") == "JOIN":
                nickname = payload["nickname"]
                admin_token = payload.get("adminToken") # Frontend sends this if it has it
                
                game = manager.games[game_code]
                
                # Check if this user is the Admin
                is_admin = False
                if admin_token and admin_token == game["admin_token"]:
                    is_admin = True
                    game["admin_socket"] = websocket
                    # Give them a special star in their name to indicate admin
                    nickname = f"★ {nickname}" 

                game["players"][websocket] = nickname
                
                # Tell the user if they are admin (so frontend shows buttons)
                if is_admin:
                    await websocket.send_json({"type": "ADMIN_CONFIRMED"})

                await manager.broadcast_status(game_code)

            # HANDLE START GAME (Admin Only)
            if payload.get("type") == "START_GAME":
                game = manager.games[game_code]
                # Security Check: Only the stored admin socket can start it
                if game["admin_socket"] == websocket:
                    game["status"] = "active"
                    await manager.broadcast_status(game_code)

    except WebSocketDisconnect:
        manager.remove_player(websocket, game_code)
        await manager.broadcast_status(game_code)