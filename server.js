const express = require('express');
const cors = require('cors');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const csv = require('csv-parser');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 5000;

// Configuration
const DEFAULT_BUDGET = 100000;
const MAX_PLAYERS_PER_TEAM = 15;
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ROOM_INACTIVE_TIMEOUT = 60 * 60 * 1000; // 1 hour

// Bidding configuration
const BIDDING_TIMEOUT = 60 * 1000; // 1 minute for bidding timeout
const BLIND_BID_TIMEOUT = 5 * 60 * 1000; // 5 minutes for blind bidding

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

// Auto-close bidding after timeout
const scheduleAutoCloseBidding = (roomId, playerName, timeout = BIDDING_TIMEOUT) => {
    setTimeout(async () => {
        if (rooms[roomId] && rooms[roomId].currentBids && rooms[roomId].currentBids[playerName]) {
            const bidData = rooms[roomId].currentBids[playerName];
            if (bidData.status === 'active') {
                await autoAwardPlayer(roomId, playerName);
            }
        }
    }, timeout);
};

// Auto-award player to highest bidder
const autoAwardPlayer = async (roomId, playerName) => {
    const room = rooms[roomId];
    if (!room || !room.currentBids || !room.currentBids[playerName]) return;

    const playerBidData = room.currentBids[playerName];
    if (playerBidData.status !== 'active') return;

    // Close bidding
    playerBidData.status = 'closed';
    playerBidData.closedAt = new Date().toISOString();

    const sortedBids = playerBidData.bids.sort((a, b) => b.amount - a.amount);
    const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;

    if (winningBid) {
        // Auto-award to highest bidder
        const team = room.users[winningBid.bidderTeam];
        const player = csvPlayers.find(p => p.name === playerName);

        if (team && player && winningBid.amount <= team.budget && team.players.length < MAX_PLAYERS_PER_TEAM) {
            // Award player
            team.budget -= winningBid.amount;
            team.players.push({
                name: playerName,
                team: player.team,
                type: player.type,
                basePrice: player.basePrice,
                boughtPrice: winningBid.amount,
                boughtAt: new Date().toISOString(),
                awardedBy: 'auto_highest_bid'
            });

            // Mark as sold
            if (!room.soldPlayers) room.soldPlayers = new Set();
            room.soldPlayers.add(playerName);

            // Update bidding data
            playerBidData.status = 'sold';
            playerBidData.soldTo = winningBid.bidderTeam;
            playerBidData.finalPrice = winningBid.amount;
            playerBidData.soldAt = new Date().toISOString();

            // Update CSV data
            player.soldPrice = winningBid.amount;

            console.log(`🤖 Auto-awarded ${playerName} to ${winningBid.bidderTeam} for ${winningBid.amount}`);
            
            // Emit socket event for player awarded
            io.to(roomId).emit('player-awarded', {
                playerName,
                soldPrice: winningBid.amount,
                buyerTeam: winningBid.bidderTeam
            });
        }
    }

    await saveRoomsToDB();
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
 * NEW API: Select/buy a player (legacy - direct purchase)
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
 * BIDDING SYSTEM ENDPOINTS
 */

/**
 * NEW API: Place a regular bid on a player
 * POST /place-bid
 */
app.post('/place-bid', async (req, res) => {
    const { roomId, playerName, bidAmount, bidderTeam } = req.body;

    if (!roomId || !playerName || typeof bidAmount !== 'number' || !bidderTeam) {
        return res.status(400).json({
            success: false,
            message: 'roomId, playerName, bidAmount, and bidderTeam are required'
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
    if (!room.users[bidderTeam]) {
        return res.status(404).json({
            success: false,
            message: 'Team not found in room'
        });
    }

    const team = room.users[bidderTeam];

    // Check if team has enough budget
    if (bidAmount > team.budget) {
        return res.status(400).json({
            success: false,
            message: 'Bid amount exceeds available budget'
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

    // Initialize bidding system if not exists
    if (!room.currentBids) {
        room.currentBids = {};
    }

    // Initialize bids for this player if not exists
    if (!room.currentBids[playerName]) {
        room.currentBids[playerName] = {
            playerName: playerName,
            playerType: player.type,
            basePrice: player.basePrice,
            bids: [],
            biddingStartTime: new Date().toISOString(),
            status: 'active',
            biddingType: 'regular'
        };
        
        // Schedule auto-close for this bidding
        scheduleAutoCloseBidding(roomId, playerName);
    }

    const playerBidData = room.currentBids[playerName];

    // Check if bidding is still active
    if (playerBidData.status !== 'active') {
        return res.status(400).json({
            success: false,
            message: `Bidding for ${playerName} is ${playerBidData.status}`
        });
    }

    // Check if bid is higher than base price
    if (player.basePrice && bidAmount < player.basePrice) {
        return res.status(400).json({
            success: false,
            message: `Bid amount must be at least ${player.basePrice} (base price)`
        });
    }

    // Check if bid is higher than current highest bid
    const currentHighestBid = playerBidData.bids.length > 0 ? 
        Math.max(...playerBidData.bids.map(b => b.amount)) : 0;
    
    if (bidAmount <= currentHighestBid) {
        return res.status(400).json({
            success: false,
            message: `Bid amount must be higher than current highest bid of ${currentHighestBid}`
        });
    }

    // Add the bid
    const newBid = {
        bidderTeam: bidderTeam,
        amount: bidAmount,
        timestamp: new Date().toISOString(),
        bidId: `${roomId}_${playerName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    playerBidData.bids.push(newBid);
    playerBidData.lastBidTime = new Date().toISOString();

    updateRoomActivity(roomId);
    await saveRoomsToDB();

    // Get current highest bidder info
    const highestBid = Math.max(...playerBidData.bids.map(b => b.amount));
    const highestBidder = playerBidData.bids.find(b => b.amount === highestBid);
    
    // Emit socket event for bid update
    io.to(roomId).emit('bid-update', {
        playerName,
        highestBid,
        highestBidder: highestBidder.bidderTeam,
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        timeRemaining: BIDDING_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())
    });

    res.json({
        success: true,
        message: `Bid placed successfully for ${playerName}`,
        bid: newBid,
        currentHighestBid: highestBid,
        currentHighestBidder: highestBidder.bidderTeam,
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        timeRemaining: BIDDING_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())
    });
});

/**
 * NEW API: Place a blind bid on a player
 * POST /place-blind-bid
 */
app.post('/place-blind-bid', async (req, res) => {
    const { roomId, playerName, bidAmount, bidderTeam } = req.body;

    if (!roomId || !playerName || typeof bidAmount !== 'number' || !bidderTeam) {
        return res.status(400).json({
            success: false,
            message: 'roomId, playerName, bidAmount, and bidderTeam are required'
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
    if (!room.users[bidderTeam]) {
        return res.status(404).json({
            success: false,
            message: 'Team not found in room'
        });
    }

    const team = room.users[bidderTeam];

    // Check if team has enough budget
    if (bidAmount > team.budget) {
        return res.status(400).json({
            success: false,
            message: 'Bid amount exceeds available budget'
        });
    }

    // Check if team already has maximum players
    if (team.players.length >= MAX_PLAYERS_PER_TEAM) {
        return res.status(400).json({
            success: false,
            message: `Team already has maximum ${MAX_PLAYERS_PER_TEAM} players`
        });
    }

    // Find player in blind bid pool
    const player = blindBidPlayers.find(p => p.name === playerName);
    if (!player) {
        return res.status(404).json({
            success: false,
            message: 'Player not found in blind bid pool'
        });
    }

    // Check if player already sold
    if (room.soldPlayers && room.soldPlayers.has(playerName)) {
        return res.status(409).json({
            success: false,
            message: 'Player already sold'
        });
    }

    // Initialize blind bidding system if not exists
    if (!room.blindBids) {
        room.blindBids = {};
    }

    // Initialize blind bids for this player if not exists
    if (!room.blindBids[playerName]) {
        room.blindBids[playerName] = {
            playerName: playerName,
            playerType: player.type,
            bids: [],
            biddingStartTime: new Date().toISOString(),
            status: 'active',
            biddingType: 'blind'
        };
        
        // Schedule auto-close for blind bidding (longer timeout)
        scheduleAutoCloseBlindBidding(roomId, playerName);
    }

    const playerBidData = room.blindBids[playerName];

    // Check if bidding is still active
    if (playerBidData.status !== 'active') {
        return res.status(400).json({
            success: false,
            message: `Blind bidding for ${playerName} is ${playerBidData.status}`
        });
    }

    // Check if team already placed a bid (only one bid per team in blind bidding)
    const existingBid = playerBidData.bids.find(b => b.bidderTeam === bidderTeam);
    if (existingBid) {
        return res.status(400).json({
            success: false,
            message: 'Team has already placed a blind bid for this player'
        });
    }

    // Add the blind bid
    const newBid = {
        bidderTeam: bidderTeam,
        amount: bidAmount,
        timestamp: new Date().toISOString(),
        bidId: `${roomId}_${playerName}_blind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    playerBidData.bids.push(newBid);
    playerBidData.lastBidTime = new Date().toISOString();

    updateRoomActivity(roomId);
    await saveRoomsToDB();
    
    // Emit socket event for blind bid update
    io.to(roomId).emit('blind-bid-update', {
        playerName,
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        timeRemaining: BLIND_BID_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())
    });

    res.json({
        success: true,
        message: `Blind bid placed successfully for ${playerName}`,
        bid: {
            bidId: newBid.bidId,
            bidderTeam: newBid.bidderTeam,
            timestamp: newBid.timestamp
        },
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        timeRemaining: BLIND_BID_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())
    });
});

// Auto-close blind bidding after timeout
const scheduleAutoCloseBlindBidding = (roomId, playerName) => {
    setTimeout(async () => {
        if (rooms[roomId] && rooms[roomId].blindBids && rooms[roomId].blindBids[playerName]) {
            const bidData = rooms[roomId].blindBids[playerName];
            if (bidData.status === 'active') {
                await autoAwardBlindBidPlayer(roomId, playerName);
            }
        }
    }, BLIND_BID_TIMEOUT);
};

// Auto-award blind bid player to highest bidder
const autoAwardBlindBidPlayer = async (roomId, playerName) => {
    const room = rooms[roomId];
    if (!room || !room.blindBids || !room.blindBids[playerName]) return;

    const playerBidData = room.blindBids[playerName];
    if (playerBidData.status !== 'active') return;

    // Close bidding
    playerBidData.status = 'closed';
    playerBidData.closedAt = new Date().toISOString();

    const sortedBids = playerBidData.bids.sort((a, b) => b.amount - a.amount);
    const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;

    if (winningBid) {
        // Auto-award to highest bidder
        const team = room.users[winningBid.bidderTeam];
        const player = blindBidPlayers.find(p => p.name === playerName);

        if (team && player && winningBid.amount <= team.budget && team.players.length < MAX_PLAYERS_PER_TEAM) {
            // Award player
            team.budget -= winningBid.amount;
            team.players.push({
                name: playerName,
                team: player.team,
                type: player.type,
                basePrice: null,
                boughtPrice: winningBid.amount,
                boughtAt: new Date().toISOString(),
                awardedBy: 'auto_blind_bid'
            });

            // Mark as sold
            if (!room.soldPlayers) room.soldPlayers = new Set();
            room.soldPlayers.add(playerName);

            // Update bidding data
            playerBidData.status = 'sold';
            playerBidData.soldTo = winningBid.bidderTeam;
            playerBidData.finalPrice = winningBid.amount;
            playerBidData.soldAt = new Date().toISOString();

            console.log(`🎯 Auto-awarded blind bid ${playerName} to ${winningBid.bidderTeam} for ${winningBid.amount}`);
            
            // Emit socket event for blind player awarded
            io.to(roomId).emit('blind-player-awarded', {
                playerName,
                soldPrice: winningBid.amount,
                buyerTeam: winningBid.bidderTeam
            });
        }
    }

    await saveRoomsToDB();
};

/**
 * NEW API: Get current bids for a player (regular bidding)
 * GET /player-bids/:roomId/:playerName
 */
app.get('/player-bids/:roomId/:playerName', (req, res) => {
    const { roomId, playerName } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    
    if (!room.currentBids || !room.currentBids[playerName]) {
        return res.json({
            success: true,
            playerName: playerName,
            bids: [],
            highestBid: null,
            biddingStatus: 'not_started',
            biddingType: 'regular'
        });
    }

    const playerBidData = room.currentBids[playerName];
    const sortedBids = playerBidData.bids.sort((a, b) => b.amount - a.amount);
    
    const highestBid = sortedBids.length > 0 ? sortedBids[0] : null;

    updateRoomActivity(roomId);

    res.json({
        success: true,
        playerName: playerName,
        playerType: playerBidData.playerType,
        basePrice: playerBidData.basePrice,
        bids: sortedBids,
        highestBid: highestBid,
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        biddingType: playerBidData.biddingType,
        biddingStartTime: playerBidData.biddingStartTime,
        lastBidTime: playerBidData.lastBidTime,
        timeRemaining: playerBidData.status === 'active' ? 
            Math.max(0, BIDDING_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())) : 0
    });
});

/**
 * NEW API: Get blind bids for a player (only after bidding is closed)
 * GET /blind-bids/:roomId/:playerName
 */
app.get('/blind-bids/:roomId/:playerName', (req, res) => {
    const { roomId, playerName } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    
    if (!room.blindBids || !room.blindBids[playerName]) {
        return res.json({
            success: true,
            playerName: playerName,
            bids: [],
            highestBid: null,
            biddingStatus: 'not_started',
            biddingType: 'blind'
        });
    }

    const playerBidData = room.blindBids[playerName];

    // Only show bids if bidding is closed or sold
    if (playerBidData.status === 'active') {
        return res.json({
            success: true,
            playerName: playerName,
            playerType: playerBidData.playerType,
            totalBids: playerBidData.bids.length,
            biddingStatus: playerBidData.status,
            biddingType: playerBidData.biddingType,
            biddingStartTime: playerBidData.biddingStartTime,
            timeRemaining: Math.max(0, BLIND_BID_TIMEOUT - (Date.now() - new Date(playerBidData.biddingStartTime).getTime())),
            message: 'Blind bids are hidden until bidding closes'
        });
    }

    const sortedBids = playerBidData.bids.sort((a, b) => b.amount - a.amount);
    const highestBid = sortedBids.length > 0 ? sortedBids[0] : null;

    updateRoomActivity(roomId);

    res.json({
        success: true,
        playerName: playerName,
        playerType: playerBidData.playerType,
        bids: sortedBids,
        highestBid: highestBid,
        totalBids: playerBidData.bids.length,
        biddingStatus: playerBidData.status,
        biddingType: playerBidData.biddingType,
        biddingStartTime: playerBidData.biddingStartTime,
        lastBidTime: playerBidData.lastBidTime,
        closedAt: playerBidData.closedAt,
        soldTo: playerBidData.soldTo,
        finalPrice: playerBidData.finalPrice
    });
});

/**
 * NEW API: Get all active bids in a room
 * GET /room-bids/:roomId
 */
app.get('/room-bids/:roomId', (req, res) => {
    const { roomId } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    
    const regularBids = [];
    const blindBids = [];

    // Get regular bids
    if (room.currentBids) {
        Object.values(room.currentBids)
            .filter(bidData => bidData.status === 'active')
            .forEach(bidData => {
                const sortedBids = bidData.bids.sort((a, b) => b.amount - a.amount);
                const highestBid = sortedBids.length > 0 ? sortedBids[0] : null;
                
                regularBids.push({
                    playerName: bidData.playerName,
                    playerType: bidData.playerType,
                    basePrice: bidData.basePrice,
                    highestBid: highestBid,
                    totalBids: bidData.bids.length,
                    biddingStartTime: bidData.biddingStartTime,
                    lastBidTime: bidData.lastBidTime,
                    biddingType: 'regular',
                    timeRemaining: Math.max(0, BIDDING_TIMEOUT - (Date.now() - new Date(bidData.biddingStartTime).getTime())),
                    allBids: sortedBids
                });
            });
    }

    // Get blind bids (only show count while active)
    if (room.blindBids) {
        Object.values(room.blindBids)
            .filter(bidData => bidData.status === 'active')
            .forEach(bidData => {
                blindBids.push({
                    playerName: bidData.playerName,
                    playerType: bidData.playerType,
                    totalBids: bidData.bids.length,
                    biddingStartTime: bidData.biddingStartTime,
                    biddingType: 'blind',
                    timeRemaining: Math.max(0, BLIND_BID_TIMEOUT - (Date.now() - new Date(bidData.biddingStartTime).getTime())),
                    message: 'Blind bids are hidden until bidding closes'
                });
            });
    }

    // Sort by latest activity
    regularBids.sort((a, b) => new Date(b.lastBidTime || b.biddingStartTime) - new Date(a.lastBidTime || a.biddingStartTime));
    blindBids.sort((a, b) => new Date(b.biddingStartTime) - new Date(a.biddingStartTime));

    updateRoomActivity(roomId);

    res.json({
        success: true,
        regularBids: regularBids,
        blindBids: blindBids,
        totalActiveRegularBids: regularBids.length,
        totalActiveBlindBids: blindBids.length
    });
});

/**
 * NEW API: Get bidding history for a room
 * GET /bidding-history/:roomId
 */
app.get('/bidding-history/:roomId', (req, res) => {
    const { roomId } = req.params;

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    const history = [];

    // Get regular bidding history
    if (room.currentBids) {
        Object.values(room.currentBids).forEach(bidData => {
            if (bidData.status === 'sold' || bidData.status === 'closed') {
                const sortedBids = bidData.bids.sort((a, b) => b.amount - a.amount);
                const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;
                
                history.push({
                    playerName: bidData.playerName,
                    playerType: bidData.playerType,
                    basePrice: bidData.basePrice,
                    biddingType: 'regular',
                    status: bidData.status,
                    winningBid: winningBid,
                    totalBids: bidData.bids.length,
                    allBids: sortedBids,
                    biddingStartTime: bidData.biddingStartTime,
                    closedAt: bidData.closedAt,
                    soldAt: bidData.soldAt,
                    soldTo: bidData.soldTo,
                    finalPrice: bidData.finalPrice
                });
            }
        });
    }

    // Get blind bidding history
    if (room.blindBids) {
        Object.values(room.blindBids).forEach(bidData => {
            if (bidData.status === 'sold' || bidData.status === 'closed') {
                const sortedBids = bidData.bids.sort((a, b) => b.amount - a.amount);
                const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;
                
                history.push({
                    playerName: bidData.playerName,
                    playerType: bidData.playerType,
                    biddingType: 'blind',
                    status: bidData.status,
                    winningBid: winningBid,
                    totalBids: bidData.bids.length,
                    allBids: sortedBids,
                    biddingStartTime: bidData.biddingStartTime,
                    closedAt: bidData.closedAt,
                    soldAt: bidData.soldAt,
                    soldTo: bidData.soldTo,
                    finalPrice: bidData.finalPrice
                });
            }
        });
    }

    // Sort by sold date (most recent first)
    history.sort((a, b) => new Date(b.soldAt || b.closedAt) - new Date(a.soldAt || a.closedAt));

    updateRoomActivity(roomId);

    res.json({
        success: true,
        history: history,
        totalSoldPlayers: history.filter(h => h.status === 'sold').length,
        totalClosedBids: history.length
    });
});

/**
 * NEW API: Start regular bidding for a player
 * POST /start-bidding
 */
app.post('/start-bidding', async (req, res) => {
    const { roomId, playerName } = req.body;

    if (!roomId || !playerName) {
        return res.status(400).json({
            success: false,
            message: 'roomId and playerName are required'
        });
    }

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];

    // Find player in main auction data
    const player = csvPlayers.find(p => p.name === playerName && p.basePrice !== null);
    if (!player) {
        return res.status(404).json({
            success: false,
            message: 'Player not found in main auction pool'
        });
    }

    // Check if player already sold
    if (room.soldPlayers && room.soldPlayers.has(playerName)) {
        return res.status(409).json({
            success: false,
            message: 'Player already sold'
        });
    }

    // Initialize bidding system if not exists
    if (!room.currentBids) {
        room.currentBids = {};
    }

    // Check if bidding already exists for this player
    if (room.currentBids[playerName]) {
        return res.status(409).json({
            success: false,
            message: 'Bidding already started for this player'
        });
    }

    // Start bidding for this player
    room.currentBids[playerName] = {
        playerName: playerName,
        playerType: player.type,
        basePrice: player.basePrice,
        bids: [],
        biddingStartTime: new Date().toISOString(),
        status: 'active',
        biddingType: 'regular'
    };

    // Schedule auto-close for this bidding
    scheduleAutoCloseBidding(roomId, playerName);

    updateRoomActivity(roomId);
    await saveRoomsToDB();

    res.json({
        success: true,
        message: `Regular bidding started for ${playerName}`,
        playerName: playerName,
        playerType: player.type,
        basePrice: player.basePrice,
        biddingStartTime: room.currentBids[playerName].biddingStartTime,
        biddingTimeout: BIDDING_TIMEOUT,
        biddingType: 'regular'
    });
});

/**
 * NEW API: Start blind bidding for a player
 * POST /start-blind-bidding
 */
app.post('/start-blind-bidding', async (req, res) => {
    const { roomId, playerName } = req.body;

    if (!roomId || !playerName) {
        return res.status(400).json({
            success: false,
            message: 'roomId and playerName are required'
        });
    }

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];

    // Find player in blind bid pool
    const player = blindBidPlayers.find(p => p.name === playerName);
    if (!player) {
        return res.status(404).json({
            success: false,
            message: 'Player not found in blind bid pool'
        });
    }

    // Check if player already sold
    if (room.soldPlayers && room.soldPlayers.has(playerName)) {
        return res.status(409).json({
            success: false,
            message: 'Player already sold'
        });
    }

    // Initialize blind bidding system if not exists
    if (!room.blindBids) {
        room.blindBids = {};
    }

    // Check if bidding already exists for this player
    if (room.blindBids[playerName]) {
        return res.status(409).json({
            success: false,
            message: 'Blind bidding already started for this player'
        });
    }

    // Start blind bidding for this player
    room.blindBids[playerName] = {
        playerName: playerName,
        playerType: player.type,
        bids: [],
        biddingStartTime: new Date().toISOString(),
        status: 'active',
        biddingType: 'blind'
    };

    // Schedule auto-close for blind bidding
    scheduleAutoCloseBlindBidding(roomId, playerName);

    updateRoomActivity(roomId);
    await saveRoomsToDB();

    res.json({
        success: true,
        message: `Blind bidding started for ${playerName}`,
        playerName: playerName,
        playerType: player.type,
        biddingStartTime: room.blindBids[playerName].biddingStartTime,
        biddingTimeout: BLIND_BID_TIMEOUT,
        biddingType: 'blind'
    });
});

/**
 * NEW API: Manually close bidding (emergency)
 * POST /close-bidding
 */
app.post('/close-bidding', async (req, res) => {
    const { roomId, playerName, biddingType } = req.body;

    if (!roomId || !playerName || !biddingType) {
        return res.status(400).json({
            success: false,
            message: 'roomId, playerName, and biddingType are required'
        });
    }

    if (!validateRoom(roomId)) {
        return res.status(404).json({
            success: false,
            message: 'Room not found'
        });
    }

    const room = rooms[roomId];
    let bidData = null;

    if (biddingType === 'regular') {
        if (!room.currentBids || !room.currentBids[playerName]) {
            return res.status(404).json({
                success: false,
                message: 'No active regular bidding found for this player'
            });
        }
        bidData = room.currentBids[playerName];
    } else if (biddingType === 'blind') {
        if (!room.blindBids || !room.blindBids[playerName]) {
            return res.status(404).json({
                success: false,
                message: 'No active blind bidding found for this player'
            });
        }
        bidData = room.blindBids[playerName];
    } else {
        return res.status(400).json({
            success: false,
            message: 'biddingType must be "regular" or "blind"'
        });
    }

    if (bidData.status !== 'active') {
        return res.status(400).json({
            success: false,
            message: `Bidding for ${playerName} is already ${bidData.status}`
        });
    }

    // Manually trigger auto-award
    if (biddingType === 'regular') {
        await autoAwardPlayer(roomId, playerName);
    } else {
        await autoAwardBlindBidPlayer(roomId, playerName);
    }

    // Get updated bid data
    const updatedBidData = biddingType === 'regular' ? 
        room.currentBids[playerName] : 
        room.blindBids[playerName];

    const sortedBids = updatedBidData.bids.sort((a, b) => b.amount - a.amount);
    const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;

    res.json({
        success: true,
        message: `${biddingType} bidding manually closed for ${playerName}`,
        playerName: playerName,
        biddingType: biddingType,
        winningBid: winningBid,
        totalBids: updatedBidData.bids.length,
        status: updatedBidData.status,
        closedAt: updatedBidData.closedAt,
        soldTo: updatedBidData.soldTo,
        finalPrice: updatedBidData.finalPrice
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
        currentBids: {},
        blindBids: {},
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
        mainAuctionPlayersAvailable: Object.values(mainAuctionPlayers).flat().length,
        biddingTimeouts: {
            regular: BIDDING_TIMEOUT,
            blind: BLIND_BID_TIMEOUT
        }
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
        activeBidsCount: room.currentBids ? Object.keys(room.currentBids).filter(p => room.currentBids[p].status === 'active').length : 0,
        activeBlindBidsCount: room.blindBids ? Object.keys(room.blindBids).filter(p => room.blindBids[p].status === 'active').length : 0,
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
        message: 'Fantasy Sports Auction Server with Bidding System is running',
        timestamp: new Date().toISOString(),
        activeRooms: Object.keys(rooms).length,
        storage: 'lowdb (file-based)',
        csvPlayersLoaded: csvPlayers.length,
        blindBidPlayers: blindBidPlayers.length,
        mainAuctionPlayers: Object.values(mainAuctionPlayers).flat().length,
        features: {
            regularBidding: true,
            blindBidding: true,
            autoBidding: true,
            batchAuction: true
        },
        timeouts: {
            regularBidding: BIDDING_TIMEOUT + 'ms',
            blindBidding: BLIND_BID_TIMEOUT + 'ms'
        }
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
            activeBids: room.currentBids ? Object.keys(room.currentBids).filter(p => room.currentBids[p].status === 'active').length : 0,
            activeBlindBids: room.blindBids ? Object.keys(room.blindBids).filter(p => room.blindBids[p].status === 'active').length : 0,
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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Join a room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Client ${socket.id} joined room: ${roomId}`);
    });
    
    // Leave a room
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        console.log(`Client ${socket.id} left room: ${roomId}`);
    });
    
    // Disconnect event
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
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
        
        // Start server with Socket.IO
        server.listen(PORT, () => {
            console.log(`🚀 Fantasy Sports Auction Server with Advanced Bidding running on port ${PORT}`);
            console.log(`🔌 WebSocket server enabled for real-time updates`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔧 Debug players: http://localhost:${PORT}/debug/players`);
            console.log(`🔧 Debug rooms: http://localhost:${PORT}/debug/rooms`);
            console.log(`💾 Using lowdb for persistence + CSV data`);
            console.log(`🎯 Regular bidding timeout: ${BIDDING_TIMEOUT / 1000} seconds`);
            console.log(`🎯 Blind bidding timeout: ${BLIND_BID_TIMEOUT / 1000} seconds`);
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

module.exports = { app, server, io };