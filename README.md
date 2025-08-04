# 🏏 Fantasy Sports Auction Server

A comprehensive Node.js backend server for managing fantasy cricket auctions with real-time player bidding, budget management, and team building capabilities.

## ✨ Features

- **🎯 Blind Bid System** - Players without base prices for strategic bidding
- **🔄 Batch-based Main Auction** - Organized player releases in rotating type cycles
- **💰 Budget Management** - Real-time budget tracking and validation
- **👥 Multi-team Support** - Multiple teams can participate in same auction room
- **📊 Real-time State Management** - Live auction progress and team statistics
- **💾 Persistent Storage** - File-based data persistence with automatic cleanup
- **🔧 Debug APIs** - Comprehensive monitoring and debugging endpoints

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
# Clone or download the project
mkdir fantasy-auction-server
cd fantasy-auction-server

# Initialize npm project
npm init -y

# Install dependencies
npm install express cors lowdb csv-parser

# Add your server code as server.js
# Add your CSV data as auction.csv
```

### Setup CSV Data

Create an `auction.csv` file in the root directory with the following format:

```csv
Players,Team,Type,BASE,SOLD
Virat Kohli,RCB,BAT,15000000,
MS Dhoni,CSK,WK,12000000,
Rohit Sharma,MI,BAT,16000000,
Jasprit Bumrah,MI,BOWL,12000000,
Hardik Pandya,GT,AR,15000000,
Player Without Base 1,RCB,BAT,-,
Player Without Base 2,CSK,BOWL,-,
```

**Required Columns:**
- `Players` - Player name
- `Team` - Original team
- `Type` - Player type (`BAT`/`AR`/`BOWL`/`WK`)
- `BASE` - Base price (use `-` for blind bid players)
- `SOLD` - Sold price (optional, updated during auction)

### Start Server

```bash
node server.js
```

Server will start on `http://localhost:3000`

## 📖 How It Works

### Auction Flow

1. **Room Creation** - Create auction rooms with teams and budgets
2. **Blind Bid Phase** - Players without base prices available for bidding
3. **Main Auction** - Batched player releases in type cycles:
   - **BAT** (Batsmen) - 8 players per batch
   - **AR** (All-Rounders) - 5 players per batch
   - **BOWL** (Bowlers) - 8 players per batch
   - **WK** (Wicket-Keepers) - 5 players per batch

### Team Management

- Each team gets a configurable budget (default: ₹10 crore)
- Maximum 15 players per team
- Real-time budget validation
- Automatic sold player tracking

## 🛠️ API Reference

### Core Endpoints

#### Create Auction Room
```bash
curl -X POST http://localhost:3000/create-room \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "ipl-auction-2024",
    "users": ["mumbai-indians", "chennai-super-kings", "royal-challengers"],
    "budgetPerUser": 95000000
  }'
```

#### Get Next Player Batch
```bash
curl http://localhost:3000/next-batch/ipl-auction-2024
```

#### Purchase Player
```bash
curl -X POST http://localhost:3000/select-player \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "ipl-auction-2024",
    "playerName": "Virat Kohli",
    "soldPrice": 17000000,
    "buyerTeam": "royal-challengers"
  }'
```

#### Check Room State
```bash
curl http://localhost:3000/room-state/ipl-auction-2024
```

### Monitoring Endpoints

```bash
# Server health check
curl http://localhost:3000/health

# Player statistics
curl http://localhost:3000/debug/players

# Active rooms
curl http://localhost:3000/debug/rooms

# Blind bid players
curl http://localhost:3000/blind-bid-players
```

## 🧪 Testing Guide

### Complete Test Workflow

```bash
# 1. Start server and check health
curl http://localhost:3000/health

# 2. Create test auction room
curl -X POST http://localhost:3000/create-room \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "test-auction",
    "users": ["teamA", "teamB", "teamC"],
    "budgetPerUser": 100000000
  }'

# 3. Get blind bid players (no base price)
curl http://localhost:3000/blind-bid-players

# 4. Start main auction - get first batch
curl http://localhost:3000/next-batch/test-auction

# 5. Buy a player
curl -X POST http://localhost:3000/select-player \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "test-auction",
    "playerName": "Virat Kohli",
    "soldPrice": 16000000,
    "buyerTeam": "teamA"
  }'

# 6. Check updated room state
curl http://localhost:3000/room-state/test-auction

# 7. Continue with next batches...
curl http://localhost:3000/next-batch/test-auction
```

### Expected Server Output

```
📁 Database initialized with lowdb
📊 Loaded 21 players from CSV
🎯 Blind bid players: 3
🏏 Main auction players: 18
🧹 Room cleanup scheduled every 30 minutes
🚀 Fantasy Sports Auction Server running on port 3000
📊 Health check: http://localhost:3000/health
🔧 Debug players: http://localhost:3000/debug/players
🔧 Debug rooms: http://localhost:3000/debug/rooms
💾 Using lowdb for persistence + CSV data
```

## ⚙️ Configuration

### Environment Variables

```bash
PORT=3000  # Server port (default: 3000)
```

### Constants (in code)

```javascript
const DEFAULT_BUDGET = 100000;           // Default team budget
const MAX_PLAYERS_PER_TEAM = 15;         // Maximum players per team
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000;  // 30 minutes
const ROOM_INACTIVE_TIMEOUT = 60 * 60 * 1000;   // 1 hour

// Batch sizes for main auction
const BATCH_CONFIG = {
    BAT: 8,   // Batsmen
    AR: 5,    // All-rounders  
    BOWL: 8,  // Bowlers
    WK: 5     // Wicket-keepers
};
```

## 📁 File Structure

```
fantasy-auction-server/
├── server.js              # Main server file
├── auction.csv           # Player data (required)
├── auction_data.json     # Persistent storage (auto-created)
├── package.json          # Dependencies
├── README.md            # This file
└── api-reference.txt    # Complete API documentation
```

## 🔍 Data Persistence

- **Storage**: File-based using lowdb
- **Auto-cleanup**: Inactive rooms cleaned every 30 minutes
- **Graceful shutdown**: Data saved on SIGINT/SIGTERM
- **Room timeout**: 1 hour inactivity timeout

## 🚨 Error Handling

The server provides comprehensive error responses:

```json
// Example error responses
{
  "success": false,
  "message": "Room not found"
}

{
  "success": false, 
  "message": "Insufficient budget"
}

{
  "success": false,
  "message": "Player already sold"
}
```

## 🎮 Usage Examples

### Fantasy Cricket League

Perfect for organizing IPL-style auctions with friends:

1. Create room with team names
2. Set realistic budgets (₹95 crore like real IPL)
3. Start with blind bid players for strategy
4. Run main auction with automatic batching
5. Track spending and team building in real-time

### Corporate Fantasy Leagues

Ideal for office tournaments:

1. Lower budgets for casual play
2. Custom player pools
3. Quick auction completion
4. Fair team distribution via batching

## 🛡️ Best Practices

### Security
- Run behind reverse proxy (nginx) in production
- Add authentication for sensitive endpoints
- Validate all input data
- Use HTTPS in production

### Performance
- Monitor active room count
- Clean up inactive rooms regularly
- Consider Redis for high-traffic scenarios
- Add rate limiting for public APIs

### Data Management
- Regular backup of `auction_data.json`
- Validate CSV data before server start
- Monitor file system space
- Log important auction events

## 🐛 Troubleshooting

### Common Issues

**"auction.csv file not found"**
```bash
# Ensure CSV file exists in root directory
ls -la auction.csv
```

**"Room not found"**
```bash
# Check active rooms
curl http://localhost:3000/debug/rooms
```

**"Player not found"**
```bash
# Verify player names match CSV exactly
curl http://localhost:3000/debug/players
```

**Server won't start**
```bash
# Check if port is in use
lsof -i :3000
```

### Debug Mode

Enable detailed logging by checking debug endpoints:

```bash
# Player data validation
curl http://localhost:3000/debug/players | jq

# Room state inspection  
curl http://localhost:3000/debug/rooms | jq

# Server health check
curl http://localhost:3000/health | jq
```

## 📈 Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Web-based admin dashboard
- [ ] Player statistics and analytics
- [ ] Auction history and replay
- [ ] Multi-format support (T20, ODI, Test)
- [ ] Advanced bidding strategies
- [ ] Email notifications
- [ ] Mobile app integration

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with Express.js and lowdb
- Inspired by IPL auction format
- CSV parsing via csv-parser
- CORS support for web frontends

---

**Happy Auctioning! 🏆**

For detailed API documentation, see [api-reference.txt](api-reference.txt)