import React, { useState, useEffect, useCallback } from 'react';
import { Clock, DollarSign, Users, Trophy, RefreshCw, ArrowLeft, Check, X, AlertTriangle } from 'lucide-react';

// Type definitions
interface AuctionPlayer {
  name: string;
  team: string;
  type: 'BAT' | 'BOWL' | 'AR' | 'WK';
  basePrice?: number;
}

interface BlindBidPlayer {
  name: string;
  team: string;
  type: 'BAT' | 'BOWL' | 'AR' | 'WK';
}

interface Bid {
  bidderTeam: string;
  amount: number;
  timestamp: string;
}

interface PlayerBid {
  playerName: string;
  playerType: string;
  basePrice?: number;
  highestBid?: Bid;
  totalBids: number;
  biddingStartTime: string;
  timeRemaining: number;
  status: 'active' | 'closed' | 'awarded';
  allBids?: Bid[];
}

interface BlindBid {
  playerName: string;
  playerType: string;
  totalBids: number;
  biddingStartTime: string;
  timeRemaining: number;
  status: 'active' | 'closed' | 'awarded';
  bids?: Bid[];
}

type AuctionPhase = 'blind' | 'main' | 'completed';

// Mock WebSocket for demo
class MockSocket {
  private listeners: { [key: string]: Function[] } = {};
  
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  emit(event: string, data?: any) {
    console.log(`Socket emit: ${event}`, data);
    // Simulate connection success
    if (event === 'join-room') {
      setTimeout(() => this.trigger('connect'), 100);
    }
  }
  
  trigger(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
  
  disconnect() {
    console.log('Socket disconnected');
  }
}

// Error Boundary Component
const AuctionErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Auction error:', error);
      setHasError(true);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="bg-red-500/20 backdrop-blur-lg rounded-2xl p-8 border border-red-400/30 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-4">Auction System Error</h3>
        <p className="text-red-200 mb-4">Something went wrong with the auction system.</p>
        <button
          onClick={() => {
            setHasError(false);
            window.location.reload();
          }}
          className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
        >
          Reload Auction
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

// Blind Player Bidding Component
const BlindPlayerBidding: React.FC<{
  roomID: string;
  teamName: string;
  onBidsSubmitted: () => void;
}> = ({ roomID, teamName, onBidsSubmitted }) => {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [bidAmounts, setBidAmounts] = useState<{ [key: string]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  
  // Mock players for demo
  const availablePlayers: BlindBidPlayer[] = [
    { name: "Virat Kohli", team: "RCB", type: "BAT" },
    { name: "MS Dhoni", team: "CSK", type: "WK" },
    { name: "Jasprit Bumrah", team: "MI", type: "BOWL" },
    { name: "Hardik Pandya", team: "MI", type: "AR" },
    { name: "KL Rahul", team: "PBKS", type: "BAT" }
  ];

  const handlePlayerSelect = (playerName: string) => {
    if (selectedPlayers.includes(playerName)) {
      setSelectedPlayers(prev => prev.filter(p => p !== playerName));
      setBidAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[playerName];
        return newAmounts;
      });
    } else if (selectedPlayers.length < 5) {
      setSelectedPlayers(prev => [...prev, playerName]);
    }
  };

  const handleBidAmountChange = (playerName: string, amount: number) => {
    setBidAmounts(prev => ({ ...prev, [playerName]: amount }));
  };

  const submitBlindBids = async () => {
    setSubmitting(true);
    
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Blind bids submitted:', { selectedPlayers, bidAmounts });
      onBidsSubmitted();
    } catch (error) {
      console.error('Failed to submit blind bids:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">
          Select Players for Blind Bidding ({selectedPlayers.length}/5)
        </h3>
        <p className="text-gray-300 mb-6">
          Choose up to 5 players you want to bid on. Set your maximum bid for each selected player.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availablePlayers.map((player) => {
            const isSelected = selectedPlayers.includes(player.name);
            
            return (
              <div
                key={player.name}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? 'border-blue-400 bg-blue-500/20'
                    : 'border-white/20 bg-white/10 hover:bg-white/20'
                }`}
                onClick={() => handlePlayerSelect(player.name)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-white font-bold">{player.name}</h4>
                    <p className="text-gray-300 text-sm">{player.team}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    player.type === 'BAT' ? 'bg-blue-500/20 text-blue-300' :
                    player.type === 'BOWL' ? 'bg-green-500/20 text-green-300' :
                    player.type === 'AR' ? 'bg-purple-500/20 text-purple-300' :
                    'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {player.type}
                  </span>
                </div>
                
                {isSelected && (
                  <input
                    type="number"
                    min="100000"
                    step="100000"
                    placeholder="Enter max bid"
                    value={bidAmounts[player.name] || ''}
                    onChange={(e) => handleBidAmountChange(player.name, Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                )}
                
                {isSelected && (
                  <div className="mt-2 flex items-center text-green-300 text-sm">
                    <Check className="w-4 h-4 mr-1" />
                    Selected
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {selectedPlayers.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/20">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-bold text-white">Selected Players Summary</h4>
              <div className="text-white">
                Total Budget: ₹{Object.values(bidAmounts).reduce((sum, amount) => sum + (amount || 0), 0).toLocaleString()}
              </div>
            </div>
            
            <div className="space-y-2 mb-6">
              {selectedPlayers.map(playerName => (
                <div key={playerName} className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                  <span className="text-white">{playerName}</span>
                  <span className="text-green-300 font-medium">
                    ₹{(bidAmounts[playerName] || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            
            <button
              onClick={submitBlindBids}
              disabled={
                submitting ||
                selectedPlayers.length === 0 ||
                selectedPlayers.some(name => !bidAmounts[name] || bidAmounts[name] <= 0) ||
                !teamName
              }
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Submitting Bids...
                </>
              ) : (
                'Submit Blind Bids'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Main Auction System Component
const MainAuctionSystem: React.FC<{
  roomId: string;
  teamId: string;
  teamName: string;
  socket: any;
  onAuctionComplete: () => void;
}> = ({ roomId, teamId, teamName, socket, onAuctionComplete }) => {
  const [currentPlayer, setCurrentPlayer] = useState<AuctionPlayer | null>({
    name: "Virat Kohli",
    team: "RCB", 
    type: "BAT",
    basePrice: 2000000
  });
  const [currentBids, setCurrentBids] = useState<PlayerBid | null>({
    playerName: "Virat Kohli",
    playerType: "BAT",
    basePrice: 2000000,
    totalBids: 3,
    biddingStartTime: new Date().toISOString(),
    timeRemaining: 25000,
    status: 'active',
    highestBid: {
      bidderTeam: "Mumbai Indians",
      amount: 3500000,
      timestamp: new Date().toISOString()
    },
    allBids: [
      { bidderTeam: "Chennai Super Kings", amount: 2000000, timestamp: new Date(Date.now() - 30000).toISOString() },
      { bidderTeam: "Royal Challengers Bangalore", amount: 2500000, timestamp: new Date(Date.now() - 20000).toISOString() },
      { bidderTeam: "Mumbai Indians", amount: 3500000, timestamp: new Date(Date.now() - 10000).toISOString() }
    ]
  });
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<number>(25000);

  // Timer effect
  useEffect(() => {
    if (!currentBids || currentBids.status !== 'active') return;
    
    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 0) return 0;
        return prev - 1000;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [currentBids]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Place a bid
  const placeBid = async () => {
    if (!currentPlayer || !teamName || bidAmount <= 0) return;
    
    try {
      console.log('Placing bid:', {
        roomId,
        playerName: currentPlayer.name,
        bidAmount,
        bidderTeam: teamName
      });
      
      // Mock successful bid
      setBidAmount(0);
      
      // Update current bids with new bid
      const newBid: Bid = {
        bidderTeam: teamName,
        amount: bidAmount,
        timestamp: new Date().toISOString()
      };
      
      setCurrentBids(prev => prev ? {
        ...prev,
        highestBid: newBid,
        totalBids: prev.totalBids + 1,
        allBids: [...(prev.allBids || []), newBid],
        timeRemaining: 30000 // Reset timer
      } : null);
      
      setRemainingTime(30000);
      
    } catch (err) {
      console.error('Error placing bid:', err);
    }
  };

  const nextPlayer = () => {
    const players = [
      { name: "MS Dhoni", team: "CSK", type: "WK" as const, basePrice: 1500000 },
      { name: "Jasprit Bumrah", team: "MI", type: "BOWL" as const, basePrice: 1200000 },
      { name: "Hardik Pandya", team: "MI", type: "AR" as const, basePrice: 1800000 }
    ];
    
    const randomPlayer = players[Math.floor(Math.random() * players.length)];
    setCurrentPlayer(randomPlayer);
    setCurrentBids({
      playerName: randomPlayer.name,
      playerType: randomPlayer.type,
      basePrice: randomPlayer.basePrice,
      totalBids: 0,
      biddingStartTime: new Date().toISOString(),
      timeRemaining: 30000,
      status: 'active'
    });
    setRemainingTime(30000);
    setBidAmount(0);
  };

  if (!currentPlayer || !currentBids) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading next player...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Current Player Card */}
      <div className="lg:col-span-1 bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <div className="mb-4">
          <span className={`inline-block px-3 py-1 rounded-lg text-sm font-medium mb-2 ${
            currentPlayer.type === 'BAT' ? 'bg-blue-500/20 text-blue-300' :
            currentPlayer.type === 'BOWL' ? 'bg-green-500/20 text-green-300' :
            currentPlayer.type === 'AR' ? 'bg-purple-500/20 text-purple-300' :
            'bg-yellow-500/20 text-yellow-300'
          }`}>
            {currentPlayer.type}
          </span>
          <h2 className="text-2xl font-bold text-white">{currentPlayer.name}</h2>
          <p className="text-gray-300">{currentPlayer.team}</p>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Base Price:</span>
            <span className="text-white font-medium">
              ₹{currentPlayer.basePrice?.toLocaleString()}
            </span>
          </div>
          
          {currentBids?.highestBid && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Current Highest Bid:</span>
                <span className="text-green-300 font-bold">
                  ₹{currentBids.highestBid.amount.toLocaleString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Highest Bidder:</span>
                <span className="text-white font-medium">
                  {currentBids.highestBid.bidderTeam}
                </span>
              </div>
            </>
          )}
          
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Total Bids:</span>
            <span className="text-white font-medium">
              {currentBids?.totalBids || 0}
            </span>
          </div>
        </div>
      </div>
      
      {/* Bidding Section */}
      <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Place Your Bid</h2>
          
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-300" />
            <span className="text-yellow-300 font-medium">
              Time Remaining: {formatTimeRemaining(remainingTime)}
            </span>
          </div>
        </div>
        
        {currentBids?.status === 'active' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="number"
                min={currentBids.highestBid ? currentBids.highestBid.amount + 100000 : currentPlayer.basePrice}
                step="100000"
                value={bidAmount || ''}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                placeholder={`Minimum bid: ₹${(currentBids.highestBid ? currentBids.highestBid.amount + 100000 : currentPlayer.basePrice)?.toLocaleString()}`}
                className="flex-1 px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              
              <button
                onClick={placeBid}
                disabled={!teamName || bidAmount <= 0 || (currentBids.highestBid && bidAmount <= currentBids.highestBid.amount)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300"
              >
                Place Bid
              </button>
            </div>
            
            <p className="text-gray-300 text-sm">
              Your bid must be at least ₹100,000 higher than the current highest bid.
            </p>
            
            {/* Demo Controls */}
            <div className="mt-6 pt-6 border-t border-white/20">
              <h3 className="text-lg font-medium text-white mb-3">Demo Controls</h3>
              <button
                onClick={nextPlayer}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-xl transition-all duration-300"
              >
                Next Player (Demo)
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-green-500/20 backdrop-blur-sm rounded-xl p-6 text-center">
            <Trophy className="w-8 h-8 text-yellow-300 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">
              Sold to {currentBids.highestBid?.bidderTeam}!
            </h3>
            <p className="text-green-300 font-medium text-lg mb-4">
              ₹{currentBids.highestBid?.amount.toLocaleString()}
            </p>
            <p className="text-gray-300">
              Next player will appear shortly...
            </p>
          </div>
        )}
        
        {/* Bid History */}
        {currentBids?.allBids && currentBids.allBids.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium text-white mb-3">Bid History</h3>
            <div className="bg-black/30 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-black/20 text-gray-300 text-sm">
                  <tr>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 hidden md:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {currentBids.allBids.slice().reverse().map((bid, index) => (
                    <tr key={index} className="text-white">
                      <td className="px-4 py-3">{bid.bidderTeam}</td>
                      <td className="px-4 py-3 font-medium">₹{bid.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                        {new Date(bid.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Main Auction Page Component
const AuctionPage: React.FC = () => {
  const [auctionPhase, setAuctionPhase] = useState<AuctionPhase>('blind');
  const [teamName, setTeamName] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Mock room ID and socket
  const roomId = 'demo-room-123';
  const [socket] = useState(() => new MockSocket());
  
  useEffect(() => {
    // Mock socket connection
    socket.emit('join-room', roomId);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    return () => socket.disconnect();
  }, []);
  
  const handleBlindBidsSubmitted = () => {
    console.log('Blind bids submitted successfully');
    // Transition to main auction after a delay
    setTimeout(() => {
      setAuctionPhase('main');
    }, 2000);
  };
  
  const handleAuctionComplete = () => {
    console.log('Main auction completed!');
    setAuctionPhase('completed');
  };
  
  const goBack = () => {
    console.log('Going back to room page');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading auction data...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-red-500/20 backdrop-blur-lg rounded-2xl p-8 border border-red-400/30 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-red-200 mb-6">{error}</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
            >
              Try Again
            </button>
            <button
              onClick={goBack}
              className="bg-gray-500/20 hover:bg-gray-500/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4 md:p-8">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white">Room: {roomId}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          
          <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium">
            Phase: {auctionPhase === 'blind' ? 'Blind Auction' : auctionPhase === 'main' ? 'Main Auction' : 'Completed'}
          </div>
        </div>
      </div>
      
      {/* Team Name Input */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <label className="text-white font-medium">Your Team Name:</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => {
              setTeamName(e.target.value);
              setTeamId(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            }}
            placeholder="Enter your team name"
            className="flex-1 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>
      
      {/* Phase Controls (Demo) */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6 flex gap-4">
        <button
          onClick={() => setAuctionPhase('blind')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            auctionPhase === 'blind' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white/20 text-gray-300 hover:bg-white/30'
          }`}
        >
          Blind Phase
        </button>
        <button
          onClick={() => setAuctionPhase('main')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            auctionPhase === 'main' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white/20 text-gray-300 hover:bg-white/30'
          }`}
        >
          Main Auction
        </button>
        <button
          onClick={() => setAuctionPhase('completed')}
          className={`px-4 py-2 rounded-xl font-medium transition-all ${
            auctionPhase === 'completed' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white/20 text-gray-300 hover:bg-white/30'
          }`}
        >
          Completed
        </button>
      </div>
      
      {/* Blind Auction Phase */}
      {auctionPhase === 'blind' && (
        <div className="space-y-6">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Blind Auction Phase</h2>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-300" />
                <span className="text-yellow-300 font-medium">
                  Phase: Blind Bidding Active
                </span>
              </div>
            </div>
            <p className="text-gray-300">
              Select up to 5 players you want to bid on. Your selections will be kept secret 
              until the blind auction phase ends.
            </p>
          </div>

          <BlindPlayerBidding
            roomID={roomId}
            teamName={teamName}
            onBidsSubmitted={handleBlindBidsSubmitted}
          />
        </div>
      )}
      
      {/* Main Auction Phase */}
      {auctionPhase === 'main' && (
        <AuctionErrorBoundary>
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Main Auction Phase</h2>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
            </div>
            
            <MainAuctionSystem
              roomId={roomId}
              teamId={teamId}
              teamName={teamName}
              socket={socket}
              onAuctionComplete={handleAuctionComplete}
            />
          </div>
        </AuctionErrorBoundary>
      )}
      
      {/* Auction Completed */}
      {auctionPhase === 'completed' && (
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 text-center">
          <Trophy className="w-16 h-16 text-yellow-300 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-3">Auction Completed!</h2>
          <p className="text-gray-300 mb-6">
            All players have been auctioned. Check the room page to see the final results.
          </p>
          <button
            onClick={goBack}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all duration-300"
          >
            View Results
          </button>
        </div>
      )}
    </div>
  );
};

export default AuctionPage