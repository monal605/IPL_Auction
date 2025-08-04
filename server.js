const express = require('express');
const cors = require('cors');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const csv = require('csv-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DEFAULT_BUDGET = 100000;
const MAX_PLAYERS_PER_TEAM = 15;
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ROOM_INACTIVE_TIMEOUT = 60 * 60 * 1000; // 1 hour

// Batch configuration for main auction
const BATCH_CONFIG = {
    BAT: 8,
    AR: 5,
    BOWL: 8,
    WK: 5
};

const CYCLE_ORDER = ['BAT', 'AR', 'BOWL', 'WK'];

// Initialize lowdb for persistence
const adapter = new JSONFile('auction_data.json');
const defaultData = { rooms: {} };
const db = new Low(adapter, defaultData);

// Global CSV data storage
let csvPlayers = [];
let blindBidPlayers = [];
let mainAuctionPlayers = {};

// Initialize database structure
const initDB = async () => {
    await db.read();
    db.data = db.data || { rooms: {} };
    await db.write();
    console.log('📁 Database initialized with lowdb');
};

// Load and parse CSV data
const loadCSVData = async () => {
    const csvFilePath = 'auction.csv'; // Expected CSV file name
    
    if (!fs.existsSync(csvFilePath)) {
        console.warn('⚠️  auction.csv file not found. Please add your auction.csv file to the root directory.');
        console.log('📝  Expected CSV columns: Players, Team, Type, BASE, SOLD');
        return;
    }

    return new Promise((resolve, reject) => {
        const players = [];
        
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                // Clean and normalize the data
                const baseValue = row.Base || row.BASE || row.base || '';
                const soldValue = row.Sold || row.SOLD || row.sold || '';
                
                const player = {
                    name: row.Players || row.Player || row.players || '',
                    team: row.Team || row.team || '',
                    type: (row.Type || row.type || '').toUpperCase(),
                    basePrice: (baseValue === '-' || baseValue === '' || !baseValue) ? null : parseFloat(baseValue),
                    soldPrice: (soldValue === '-' || soldValue === '' || !soldValue) ? null : parseFloat(soldValue)
                };
                
                if (player.name && player.type) {
                    players.push(player);
                }
            })
            .on('end', () => {
                csvPlayers = players;
                processPlayerData();
                console.log(`📊 Loaded ${csvPlayers.length} players from CSV`);
                console.log(`🎯 Blind bid players: ${blindBidPlayers.length}`);
                console.log(`🏏 Main auction players: ${Object.values(mainAuctionPlayers).flat().length}`);
                resolve();
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                reject(error);
            });
    });
};



// Process CSV data into blind bid and main auction pools
const processPlayerData = () => {
    blindBidPlayers = csvPlayers.filter(player => player.basePrice === null);
    
    const playersWithBase = csvPlayers.filter(player => player.basePrice !== null);
    
    // Group by type and sort by descending base price
    mainAuctionPlayers = {
        BAT: playersWithBase.filter(p => p.type === 'BAT').sort((a, b) => b.basePrice - a.basePrice),
        AR: playersWithBase.filter(p => p.type === 'AR').sort((a, b) => b.basePrice - a.basePrice),
        BOWL: playersWithBase.filter(p => p.type === 'BOWL').sort((a, b) => b.basePrice - a.basePrice),
        WK: playersWithBase.filter(p => p.type === 'WK').sort((a, b) => b.basePrice - a.basePrice)
    };
};

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for active rooms
let rooms = {};

// Load rooms from database on startup
const loadRoomsFromDB = async () => {
    try {
        await db.read();
        rooms = db.data.rooms || {};
        console.log(`📊 Loaded ${Object.keys(rooms).length} rooms from database`);
    } catch (error) {
        console.error('Error loading rooms from database:', error);
        rooms = {};
    }
};

// Save rooms to database
const saveRoomsToDB = async () => {
    try {
        db.data.rooms = rooms;
        await db.write();
    } catch (error) {
        console.error('Error saving rooms to database:', error);
    }
};

// Periodic cleanup of inactive rooms
const cleanupInactiveRooms = () => {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(rooms).forEach(roomID => {
        const room = rooms[roomID];
        const lastActivity = new Date(room.lastActivity || room.createdAt).getTime();
        
        if (now - lastActivity > ROOM_INACTIVE_TIMEOUT) {
            delete rooms[roomID];
            cleanedCount++;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} inactive rooms`);
        saveRoomsToDB();
    }
};

// Update room activity timestamp
const updateRoomActivity = (roomID) => {
    if (rooms[roomID]) {
        rooms[roomID].lastActivity = new Date().toISOString();
    }
};

// Helper function to validate if room exists
const validateRoom = (roomID) => {
    return rooms[roomID] !== undefined;
};

/**
 * NEW API: Get blind bid players
 * GET /blind-bid-players
 */
app.get('/blind-bid-players', (req, res) => {
    res.json({
        success: true,
        players: blindBidPlayers.map(player => ({
            name: player.name,
            team: player.team,
            type: player.type
        })),
        count: blindBidPlayers.length
    });
});

/**
 * NEW API: Get next batch of players for a room
 * GET /next-batch/:roomId
 */
app.get('/next-batch/:roomId', async (req, res) => {
    const { roomId } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    
    // Initialize batch tracking if not exists
    if (!room.batchState) {
        room.batchState = {
            currentCycleIndex: 0,
            sentPlayers: new Set(),
            typePointers: { BAT: 0, AR: 0, BOWL: 0, WK: 0 }
        };
    }

    const batchState = room.batchState;
    const currentType = CYCLE_ORDER[batchState.currentCycleIndex];
    const batchSize = BATCH_CONFIG[currentType];
    const availablePlayers = mainAuctionPlayers[currentType] || [];
    
    // Get next batch from current type
    const startIndex = batchState.typePointers[currentType];
    const nextBatch = [];
    
    for (let i = startIndex; i < availablePlayers.length && nextBatch.length < batchSize; i++) {
        const player = availablePlayers[i];
        if (!batchState.sentPlayers.has(player.name)) {
            nextBatch.push({
                name: player.name,
                team: player.team,
                type: player.type,
                basePrice: player.basePrice
            });
            batchState.sentPlayers.add(player.name);
        }
    }

    // Update pointer for current type
    batchState.typePointers[currentType] = startIndex + nextBatch.length;

    // Move to next type in cycle if current type is exhausted or batch is full
    if (nextBatch.length === 0 || batchState.typePointers[currentType] >= availablePlayers.length) {
        batchState.currentCycleIndex = (batchState.currentCycleIndex + 1) % CYCLE_ORDER.length;
        
        // Check if all types are exhausted
        const allTypesExhausted = CYCLE_ORDER.every(type => {
            const players = mainAuctionPlayers[type] || [];
            return batchState.typePointers[type] >= players.length;
        });
        
        if (allTypesExhausted && nextBatch.length === 0) {
            return res.json({
                success: true,
                players: [],
                currentType: null,
                nextType: null,
                batchComplete: true,
                auctionComplete: true
            });
        }
    }

    updateRoomActivity(roomId);
    await saveRoomsToDB();

    const nextType = CYCLE_ORDER[batchState.currentCycleIndex];

    res.json({
        success: true,
        players: nextBatch,
        currentType: currentType,
        nextType: nextType,
        batchSize: batchSize,
        playersInBatch: nextBatch.length,
        totalSentPlayers: batchState.sentPlayers.size
    });
});

/**
 * NEW API: Select/buy a player
 * POST /select-player
 */
app.post('/select-player', async (req, res) => {
    const { roomId, playerName, soldPrice, buyerTeam } = req.body;

    if (!roomId || !playerName || typeof soldPrice !== 'number' || !buyerTeam) {
        return res.status(400).json({
            success: false,
            message: 'roomId, playerName, soldPrice, and buyerTeam are required'
        });
    }

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    
    // Check if team exists
    if (!room.users[buyerTeam]) {
        return res.status(404).json({
            success: false,
            message: 'Team not found in room'
        });
    }

    const team = room.users[buyerTeam];

    // Check if team has enough budget
    if (soldPrice > team.budget) {
        return res.status(400).json({
            success: false,
            message: 'Insufficient budget'
        });
    }

    // Check if team already has maximum players
    if (team.players.length >= MAX_PLAYERS_PER_TEAM) {
        return res.status(400).json({
            success: false,
            message: `Team already has maximum ${MAX_PLAYERS_PER_TEAM} players`
        });
    }

    // Find player in CSV data
    const player = csvPlayers.find(p => p.name === playerName);
    if (!player) {
        return res.status(404).json({
            success: false,
            message: 'Player not found'
        });
    }

    // Check if player already sold
    if (room.soldPlayers && room.soldPlayers.has(playerName)) {
        return res.status(409).json({
            success: false,
            message: 'Player already sold'
        });
    }

    // Initialize sold players set if not exists
    if (!room.soldPlayers) {
        room.soldPlayers = new Set();
    }

    // Update team data
    team.budget -= soldPrice;
    team.players.push({
        name: playerName,
        team: player.team,
        type: player.type,
        basePrice: player.basePrice,
        boughtPrice: soldPrice,
        boughtAt: new Date().toISOString()
    });

    // Mark player as sold
    room.soldPlayers.add(playerName);

    // Update CSV data in memory (optional - for consistency)
    player.soldPrice = soldPrice;

    updateRoomActivity(roomId);
    await saveRoomsToDB();

    res.json({
        success: true,
        message: `${playerName} sold to ${buyerTeam} for ${soldPrice}`,
        player: {
            name: playerName,
            soldPrice: soldPrice,
            buyerTeam: buyerTeam
        },
        remainingBudget: team.budget,
        teamPlayerCount: team.players.length
    });
});

/**
 * NEW API: Get room state
 * GET /room-state/:roomId
 */
app.get('/room-state/:roomId', (req, res) => {
    const { roomId } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    const batchState = room.batchState || {
        currentCycleIndex: 0,
        sentPlayers: new Set(),
        typePointers: { BAT: 0, AR: 0, BOWL: 0, WK: 0 }
    };

    const currentType = CYCLE_ORDER[batchState.currentCycleIndex];
    const nextTypeIndex = (batchState.currentCycleIndex + 1) % CYCLE_ORDER.length;
    const nextType = CYCLE_ORDER[nextTypeIndex];

    // Calculate remaining players
    const totalMainAuctionPlayers = Object.values(mainAuctionPlayers).flat().length;
    const remainingPlayers = totalMainAuctionPlayers - batchState.sentPlayers.size;

    const roomState = {
        roomId: roomId,
        users: Object.keys(room.users).map(username => ({
            username: username,
            budget: room.users[username].budget,
            spentAmount: room.budgetPerUser - room.users[username].budget,
            players: room.users[username].players,
            playerCount: room.users[username].players.length,
            canBuyMore: room.users[username].players.length < MAX_PLAYERS_PER_TEAM
        })),
        currentType: currentType,
        nextType: nextType,
        remainingPlayers: remainingPlayers,
        totalPlayersSent: batchState.sentPlayers.size,
        blindBidPlayersCount: blindBidPlayers.length,
        mainAuctionPlayersCount: totalMainAuctionPlayers,
        soldPlayersCount: room.soldPlayers ? room.soldPlayers.size : 0,
        auctionPhase: remainingPlayers > 0 ? 'main_auction' : 'completed'
    };

    updateRoomActivity(roomId);

    res.json({
        success: true,
        data: roomState
    });
});

/**
 * ENHANCED API: Create room with users and budget
 * POST /create-room
 */
app.post('/create-room', async (req, res) => {
    const { roomId, users, budgetPerUser } = req.body;

    if (!roomId || !Array.isArray(users) || users.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'roomId and at least 2 users are required'
        });
    }

    if (rooms[roomId]) {
        return res.status(409).json({
            success: false,
            message: 'Room already exists'
        });
    }

    const budget = budgetPerUser || DEFAULT_BUDGET;

    // Create room with users
    const newRoom = {
        roomId: roomId,
        users: {},
        budgetPerUser: budget,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        soldPlayers: new Set(),
        batchState: {
            currentCycleIndex: 0,
            sentPlayers: new Set(),
            typePointers: { BAT: 0, AR: 0, BOWL: 0, WK: 0 }
        }
    };

    // Initialize users
    users.forEach(username => {
        newRoom.users[username] = {
            username: username,
            budget: budget,
            players: []
        };
    });

    rooms[roomId] = newRoom;
    await saveRoomsToDB();

    res.json({
        success: true,
        message: 'Room created successfully',
        roomId: roomId,
        users: users,
        budgetPerUser: budget,
        maxPlayersPerTeam: MAX_PLAYERS_PER_TEAM,
        blindBidPlayersAvailable: blindBidPlayers.length,
        mainAuctionPlayersAvailable: Object.values(mainAuctionPlayers).flat().length
    });
});

// Legacy endpoints (keeping existing functionality)

/**
 * Legacy: Join room (for backward compatibility)
 */
app.post('/join-room', async (req, res) => {
    const { roomID, teamName } = req.body;

    if (!validateRoom(roomID)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found. Use /create-room with users array instead.'
        });
    }

    // Add team if room exists and has space
    if (!rooms[roomID].users[teamName]) {
        rooms[roomID].users[teamName] = {
            username: teamName,
            budget: rooms[roomID].budgetPerUser || DEFAULT_BUDGET,
            players: []
        };
        
        updateRoomActivity(roomID);
        await saveRoomsToDB();
    }

    res.json({
        success: true,
        message: 'Team added to room',
        teamName: teamName,
        budget: rooms[roomID].users[teamName].budget
    });
});

/**
 * Enhanced: Get room data
 */
app.get('/room-data/:roomID', (req, res) => {
    const { roomID } = req.params;

    if (!validateRoom(roomID)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomID];

    const roomData = {
        roomID: roomID,
        users: Object.values(room.users || {}),
        budgetPerUser: room.budgetPerUser || DEFAULT_BUDGET,
        soldPlayersCount: room.soldPlayers ? room.soldPlayers.size : 0,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity
    };

    updateRoomActivity(roomID);

    res.json({
        success: true,
        data: roomData
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Fantasy Sports Auction Server is running',
        timestamp: new Date().toISOString(),
        activeRooms: Object.keys(rooms).length,
        storage: 'lowdb (file-based)',
        csvPlayersLoaded: csvPlayers.length,
        blindBidPlayers: blindBidPlayers.length,
        mainAuctionPlayers: Object.values(mainAuctionPlayers).flat().length
    });
});

// Debug endpoint
app.get('/debug/players', (req, res) => {
    res.json({
        success: true,
        totalPlayers: csvPlayers.length,
        blindBidPlayers: blindBidPlayers.length,
        mainAuctionPlayers: {
            BAT: mainAuctionPlayers.BAT?.length || 0,
            AR: mainAuctionPlayers.AR?.length || 0,
            BOWL: mainAuctionPlayers.BOWL?.length || 0,
            WK: mainAuctionPlayers.WK?.length || 0
        },
        batchConfig: BATCH_CONFIG,
        cycleOrder: CYCLE_ORDER
    });
});

// Debug rooms endpoint
app.get('/debug/rooms', (req, res) => {
    const roomSummary = Object.keys(rooms).map(roomID => {
        const room = rooms[roomID];
        const batchState = room.batchState || {};
        
        return {
            roomID,
            userCount: Object.keys(room.users || {}).length,
            currentType: CYCLE_ORDER[batchState.currentCycleIndex || 0],
            sentPlayers: batchState.sentPlayers ? batchState.sentPlayers.size : 0,
            soldPlayers: room.soldPlayers ? room.soldPlayers.size : 0,
            lastActivity: room.lastActivity
        };
    });

    res.json({
        success: true,
        totalRooms: Object.keys(rooms).length,
        rooms: roomSummary
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Handle 404 for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Initialize and start server
const startServer = async () => {
    try {
        // Initialize database
        await initDB();
        
        // Load CSV data
        await loadCSVData();
        
        // Load existing rooms from database
        await loadRoomsFromDB();
        
        // Start periodic cleanup
        setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL);
        console.log(`🧹 Room cleanup scheduled every ${ROOM_CLEANUP_INTERVAL / 1000 / 60} minutes`);
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Fantasy Sports Auction Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔧 Debug players: http://localhost:${PORT}/debug/players`);
            console.log(`🔧 Debug rooms: http://localhost:${PORT}/debug/rooms`);
            console.log(`💾 Using lowdb for persistence + CSV data`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await saveRoomsToDB();
    console.log('💾 Data saved to database');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Server terminating...');
    await saveRoomsToDB();
    console.log('💾 Data saved to database');
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;