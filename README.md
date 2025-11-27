# DashFlag

DashFlag is a Kahoot-inspired web application for running mini Capture The Flag (CTF) competitions. It allows an admin to create a game with custom challenges, and players can join via a game code, form teams (or play solo), and compete to solve challenges and earn points in real-time.

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, DaisyUI
- **Backend:** Python, FastAPI, WebSockets

## Project Structure

### Backend (`backend/`)
- **`main.py`**: The core of the backend. It sets up the FastAPI application, manages WebSocket connections for real-time communication, handles game state (creation, joining, starting, ending), and processes flag submissions.
- **`game_models.py`**: Defines the object-oriented models for the game entities:
  - `Player`: Represents a connected user.
  - `Team`: Represents a group of players (or a solo player) competing together.
  - `GameMember`: Abstract base class for Player and Team.

### Frontend (`frontend/`)
- **`src/App.tsx`**: The root component that sets up the routing for the application.
- **`src/pages/Home.tsx`**: The landing page where users can enter a game code to join an existing lobby or choose to host a new game.
- **`src/pages/CreateGame.tsx`**: The configuration page for admins to set up a new game. It allows enabling/disabling teams, setting team size limits, and customizing the list of challenges (points, flags, descriptions).
- **`src/pages/Lobby.tsx`**: The main game interface. It handles multiple view states:
  - **Nickname/Team Selection**: For players joining the game.
  - **Lobby/Game View**: The main dashboard showing the leaderboard, timer, and challenge grid.
  - **Admin View**: Special controls for the game host to start/end the game and monitor progress.
  - **Podium**: Displays the winners at the end of the game.
