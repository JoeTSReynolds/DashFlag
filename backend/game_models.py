from abc import ABC, abstractmethod
from typing import List, Dict, Optional
import uuid

# --- ABSTRACT BASE CLASS ---
class GameMember(ABC):
    def __init__(self, name: str):
        self.id = str(uuid.uuid4())[:8] # Unique ID
        self.name = name

    @abstractmethod
    def get_points(self) -> int:
        pass

    @abstractmethod
    def to_dict(self) -> dict:
        pass

# --- PLAYER CLASS ---
class Player(GameMember):
    def __init__(self, name: str, socket=None):
        super().__init__(name)
        self.sockets = [socket] if socket else []
        self.score = 0
        self.solves: List[str] = [] # List of Challenge IDs
        self.is_connected = True

    def get_points(self) -> int:
        return self.score

    def add_points(self, points: int):
        self.score += points

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "score": self.score,
            "solves": self.solves,
            "is_connected": len(self.sockets) > 0
        }

# --- TEAM CLASS ---
class Team(GameMember):
    def __init__(self, name: str, is_solo: bool = False):
        super().__init__(name)
        self.members: Dict[str, Player] = {} # player_id -> Player
        self.is_solo = is_solo
        self.solves: List[str] = [] # Track team-wide solves to prevent double dipping if needed

    def add_member(self, player: Player):
        self.members[player.id] = player

    def remove_member(self, player_id: str):
        if player_id in self.members:
            del self.members[player_id]

    def get_points(self) -> int:
        # Sum of all member points
        return sum(p.get_points() for p in self.members.values())

    def to_dict(self) -> dict:
        # Sort members by score for the internal leaderboard
        sorted_members = sorted(self.members.values(), key=lambda p: p.score, reverse=True)
        return {
            "id": self.id,
            "name": self.name,
            "score": self.get_points(),
            "is_solo": self.is_solo,
            "members": [p.to_dict() for p in sorted_members]
        }