from pydantic import BaseModel
from typing import List, Optional

class Hint(BaseModel):
    id: str
    content: str
    cost: int

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
    hints: List[Hint] = []
    is_premade: bool = False

PREMADE_CHALLENGES = [
    Challenge(id="misc1", title="Sanity Check", category="MISC", points=100, min_points=100, decay=0, desc="The flag is flag{welcome}", flag="flag{welcome}", files=[], is_premade=True, hints=[
        Hint(id="misc1_h1", content="Just put the flag in the box", cost=10)
    ]),
    Challenge(id="misc2", title="JPG Oops", category="MISC", points=400, min_points=200, decay=50, desc="Oh no! Someone accidentally corrupted this image file. Can you recover the image?", flag="flag{please_hire_me}", files=["Corrupted Image|/uploads/brokenjpg.jpg"], is_premade=True, hints=[
        Hint(id="misc2_h1", content="The file header seems wrong...", cost=50),
        Hint(id="misc2_h2", content="Google 'JPG magic bytes'", cost=50)
    ]),
    Challenge(id="web1", title="Inspector Gadget", category="WEB", points=200, min_points=100, decay=50, desc="Check the HTML comments.", flag="flag{html_master}", files=[], is_premade=True, hints=[
        Hint(id="web1_h1", content="Right click -> Inspect Element", cost=20)
    ]),
    Challenge(id="crypto1", title="Caesar Salad", category="CRYPTO", points=300, min_points=100, decay=30, desc="Hmmm, what's this? I wonder what this gibberish means: iodj{mxolxv_fhdvdu}", flag="flag{julius_ceasar}", files=[], is_premade=True, hints=[
        Hint(id="crypto1_h1", content="It's a rotation cipher.", cost=50)
    ]),
]
