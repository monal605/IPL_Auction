# 🏏 Fantasy Auction Frontend

A modern Next.js frontend for the Fantasy Sports Auction Server. This dashboard lets users create and join auction rooms, monitor team stats, and participate in live bidding.

---

## 🚀 Getting Started

### Prerequisites

- Node.js v14+
- Fantasy Auction backend running (`server.js` in project root)

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗂️ Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   └── room/[roomId]/page.tsx   # Room dashboard page
│   ├── lib/
│   │   ├── types.ts                 # Shared TypeScript types
│   │   └── constants.ts             # UI constants and feature flags
│   └── public/                      # Static assets
├── .next/                           # Next.js build output
├── package.json
├── tsconfig.json
├── README.md
└── ...
```

---

## 🌟 Features

- **Room Dashboard:** View teams, budgets, player lists, and auction status.
- **Live Stats:** Real-time updates for bids, sold players, and team progress.
- **Auction Navigation:** Join auctions, view results, and monitor activity.
- **Responsive Design:** Mobile-friendly, visually cohesive UI.
- **Error Handling:** Graceful error states and retry options.

---

## 🛠️ API Integration

The frontend communicates with the backend via REST endpoints:

- `GET /room-data/:roomID` — Basic room info
- `GET /room-state/:roomId` — Detailed room state
- `POST /create-room` — Create new auction room
- `POST /join-room` — Join existing room

See [api-reference.txt](../api-reference.txt) for full backend API documentation.

---

## 🖥️ UI Overview

- **Stats Cards:** Total teams, players sold, active bids, budget per team.
- **Teams Grid:** Each team’s name, budget, player count, and player list.
- **Progress Bar:** Visual indicator for team completion (max 16 players).
- **Action Section:** Join auction or view results, depending on phase.
- **Footer:** Room creation and last activity timestamps.

---

## 🎨 Styling

- **Background:** `bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900`
- **Cards:** `bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20`
- **Buttons:** `bg-white/20 hover:bg-white/30 rounded-xl backdrop-blur-sm`
- **Inputs:** `bg-white/20 border border-white/30 rounded-xl text-white`

---

## ⚙️ Configuration

- **Feature Flags:** See [`FEATURES`](src/lib/constants.ts) for toggles (socket, debug mode, etc).
- **Validation Rules:** Room ID and team name validation in [`ROOM_VALIDATION`](src/lib/constants.ts).

---

## 🧩 Extending

- Add new pages in `src/app/`
- Use shared types from [`types.ts`](src/lib/types.ts)
- Customize constants in [`constants.ts`](src/lib/constants.ts)

---

## 🐛 Troubleshooting

- **Network error:** Ensure backend is running and accessible at `localhost:5000`
- **Room not found:** Check active rooms via backend `/debug/rooms`
- **Player not found:** Verify player names match CSV exactly

---

## 📄 License

MIT License

---

**Happy Auctioning!