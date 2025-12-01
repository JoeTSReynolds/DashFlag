from pydantic import BaseModel
from typing import List, Optional

class Challenge(BaseModel):
    id: str
    title: str
    category: str
    points: int
    min_points: int
    decay: int
    desc: str
    flag: str
    files: List[str] = []
    is_premade: bool = False
