# DashFlag

DashFlag is a Kahoot-inspired web application for running mini Capture The Flag (CTF) competitions. It allows an admin to create a game with custom challenges, and players can join via a game code, form teams (or play solo), and compete to solve challenges and earn points in real-time.

## Features

### Game Modes & Configuration
*   **Flexible Team Support**: Run games in **Solo Mode** (every player for themselves) or **Team Mode** (players create or join teams).
*   **Customizable Rules**: Set max team sizes, game duration (Days/Hours/Minutes), and scoring parameters.
*   **Dynamic Scoring**: Supports dynamic scoring where points decay based on the number of solves, ensuring competitive balance.

### Challenge Management
*   **Challenge Library**: Choose from a set of built-in pre-made challenges (Web, Crypto, Pwn, Misc).
*   **Custom Challenges**: Create your own challenges from scratch with custom titles, descriptions, categories, and flags.
*   **File Attachments**: 
    *   Upload files directly to challenges.
    *   Rename files for display (e.g., hide the real filename behind a friendly name).
    *   Secure file serving and downloading for players.

### Real-Time Gameplay
*   **Live Leaderboard**: Real-time ranking updates via WebSockets.
*   **Instant Feedback**: Players receive immediate confirmation for correct/incorrect flag submissions.
*   **Live Timer**: Synchronized countdown timer for all players.
*   **Admin Dashboard**: Hosts can monitor solve history, see active teams, and manually start or end the game.

### User Experience
*   **Responsive Design**: Built with Tailwind CSS and DaisyUI for a modern, dark-mode friendly interface.
*   **Interactive UI**: 
    *   Confetti celebration for game completion.
    *   Toast notifications for game events.
    *   FontAwesome icons for visual clarity.
*   **Lobby System**: Smooth onboarding flow (Enter Code -> Set Nickname -> Join/Create Team -> Wait for Start).

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, DaisyUI, FontAwesome
- **Backend:** Python, FastAPI, WebSockets, Uvicorn

## Project Structure

### Backend (`backend/`)
- **`main.py`**: The core of the backend. It sets up the FastAPI application, manages WebSocket connections for real-time communication, handles game state (creation, joining, starting, ending), and processes flag submissions.
- **`game_models.py`**: Defines the object-oriented models for the game entities (`Player`, `Team`).
- **`challenges.py`**: Pydantic models for challenge data structure.
- **`uploads/`**: Directory for storing challenge file attachments.

### Frontend (`frontend/`)
- **`src/pages/Home.tsx`**: Landing page for joining or hosting games.
- **`src/pages/CreateGame.tsx`**: Comprehensive configuration suite for admins to build the CTF. Includes file upload handling and challenge editing.
- **`src/pages/Lobby.tsx`**: The main game engine handling all player and admin states (Lobby, Game, Podium).
