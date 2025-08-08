'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
// First install socket.io-client:
// npm install socket.io-client @types/socket.io-client
import { Socket } from 'socket.io-client';
import io from 'socket.io-client';
import { Clock, DollarSign, Users, Trophy, RefreshCw, ArrowLeft, Check, X } from 'lucide-react';
import { AuctionPlayer, BlindBidPlayer, PlayerType, AuctionPhase } from '../../../lib/types';

// Socket.IO connection
let socket: typeof Socket | null = null;

interface Bid {
  bidderTeam: string;
  amount: number;
  timestamp: string;
}

interface PlayerBid {
  playerName: string;
  playerType: PlayerType;
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
  playerType: PlayerType;
  totalBids: number;
  biddingStartTime: string;
  timeRemaining: number;
  status: 'active' | 'closed' | 'awarded';
  bids?: Bid[];
}

const AuctionPage = () => {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  
  // State variables
  const [auctionPhase, setAuctionPhase] = useState<AuctionPhase>('blind');
  const [blindBidPlayers, setBlindBidPlayers] = useState<BlindBidPlayer[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<AuctionPlayer | null>(null);
  const [currentBids, setCurrentBids] = useState<PlayerBid | null>(null);
  const [blindBids, setBlindBids] = useState<Record<string, BlindBid>>({});
  const [teamName, setTeamName] = useState<string>('');
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  
  // Initialize Socket.IO connection
  useEffect(() => {
    if (!roomId) return;
    
    // Initialize socket connection
    socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setConnected(true);
      socket?.emit('join-room', roomId);
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setConnected(false);
    });
    
    socket.on('bid-update', (data: { playerName: string | undefined; highestBidder: any; highestBid: any; totalBids: any; timeRemaining: any; biddingStatus: any; }) => {
      if (data.playerName === currentPlayer?.name) {
        setCurrentBids(prevBids => ({
          ...prevBids!,
          highestBid: {
            bidderTeam: data.highestBidder,
            amount: data.highestBid,
            timestamp: new Date().toISOString()
          },
          totalBids: data.totalBids,
          timeRemaining: data.timeRemaining,
          status: data.biddingStatus
        }));
      }
    });
    
    socket.on('blind-bid-update', (data: { playerName: string | number; totalBids: any; timeRemaining: any; biddingStatus: any; }) => {
      setBlindBids(prevBids => ({
        ...prevBids,
        [data.playerName]: {
          ...prevBids[data.playerName],
          totalBids: data.totalBids,
          timeRemaining: data.timeRemaining,
          status: data.biddingStatus
        }
      }));
    });
    
    socket.on('player-awarded', (data: { playerName: string | undefined; buyerTeam: any; soldPrice: any; }) => {
      if (data.playerName === currentPlayer?.name) {
        setCurrentBids(prevBids => ({
          ...prevBids!,
          status: 'awarded',
          highestBid: {
            bidderTeam: data.buyerTeam,
            amount: data.soldPrice,
            timestamp: new Date().toISOString()
          }
        }));
        
        // Fetch next player after a short delay
        setTimeout(() => {
          fetchNextPlayer();
        }, 3000);
      }
    });
    
    socket.on('blind-player-awarded', (data) => {
      if (data && data.playerName) {
        setBlindBids(prevBids => ({
          ...prevBids,
          [data.playerName]: {
            ...prevBids[data.playerName],
            status: 'awarded'
          }
        }));
        
        // Check if all blind bids are completed
        checkBlindAuctionStatus();
      } else {
        console.error('Invalid data received in blind-player-awarded event:', data);
      }
    });
    
    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.emit('leave-room', roomId);
        socket.disconnect();
      }
    };
  }, [roomId, currentPlayer]);
  
  // Timer effect for countdown
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
  
  // Initial data loading
  useEffect(() => {
    if (!roomId) return;
    
    const fetchInitialData = async () => {
      try {
        // Get room state to determine auction phase
        const stateResponse = await fetch(`http://localhost:5000/room-state/${roomId}`);
        const stateResult = await stateResponse.json();
        
        if (stateResult.success) {
          setAuctionPhase(stateResult.data.auctionPhase);
          
          if (stateResult.data.auctionPhase === 'blind') {
            // Fetch blind bid players
            await fetchBlindBidPlayers();
          } else if (stateResult.data.auctionPhase === 'main') {
            // Fetch current player for main auction
            await fetchNextPlayer();
          }
        } else {
          setError(stateResult.message || 'Failed to fetch room state');
        }
      } catch (err) {
        setError('Network error. Please check if the server is running.');
        console.error('Error fetching initial data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [roomId]);
  
  // Fetch blind bid players
  const fetchBlindBidPlayers = async () => {
    try {
      const response = await fetch(`http://localhost:5000/blind-bid-players?roomId=${roomId}`);
      const result = await response.json();
      
      if (result.success) {
        setBlindBidPlayers(result.players);
        
        // Initialize blind bids state
        const initialBlindBids: Record<string, BlindBid> = {};
        result.players.forEach((player: BlindBidPlayer) => {
          initialBlindBids[player.name] = {
            playerName: player.name,
            playerType: player.type,
            totalBids: 0,
            biddingStartTime: new Date().toISOString(),
            timeRemaining: 5 * 60 * 1000, // 5 minutes in milliseconds
            status: 'active'
          };
        });
        
        setBlindBids(initialBlindBids);
      } else {
        setError(result.message || 'Failed to fetch blind bid players');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error fetching blind bid players:', err);
    }
  };
  
  // Fetch next player for main auction
  const fetchNextPlayer = async () => {
    try {
      const response = await fetch(`http://localhost:5000/next-batch/${roomId}`);
      const result = await response.json();
      
      if (result.success && result.players.length > 0) {
        const player = result.players[0];
        setCurrentPlayer(player);
        
        // Fetch current bids for this player
        fetchPlayerBids(player.name);
      } else if (result.auctionComplete) {
        setAuctionPhase('completed');
      } else {
        setError(result.message || 'Failed to fetch next player');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error fetching next player:', err);
    }
  };
  
  // Fetch current bids for a player
  const fetchPlayerBids = async (playerName: string) => {
    try {
      const response = await fetch(`http://localhost:5000/player-bids/${roomId}/${playerName}`);
      const result = await response.json();
      
      if (result.success) {
        setCurrentBids(result.data);
        setRemainingTime(result.data.timeRemaining);
      } else {
        // If no active bidding, start one
        await startBidding(playerName);
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error fetching player bids:', err);
    }
  };
  
  // Start bidding for a player
  const startBidding = async (playerName: string) => {
    try {
      const response = await fetch(`http://localhost:5000/start-bidding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          playerName
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCurrentBids({
          playerName,
          playerType: currentPlayer!.type,
          basePrice: currentPlayer!.basePrice,
          totalBids: 0,
          biddingStartTime: new Date().toISOString(),
          timeRemaining: 10 * 1000, // 10 seconds in milliseconds
          status: 'active'
        });
        setRemainingTime(10 * 1000);
      } else {
        setError(result.message || 'Failed to start bidding');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error starting bidding:', err);
    }
  };
  
  // Place a bid in main auction
  const placeBid = async () => {
    if (!currentPlayer || !teamName || bidAmount <= 0) return;
    
    try {
      const response = await fetch(`http://localhost:5000/place-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          playerName: currentPlayer.name,
          bidAmount,
          bidderTeam: teamName
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Reset bid amount input
        setBidAmount(0);
      } else {
        setError(result.message || 'Failed to place bid');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error placing bid:', err);
    }
  };
  
  // Place a blind bid
  const placeBlindBid = async (playerName: string) => {
    if (!teamName || bidAmount <= 0) return;
    
    try {
      const response = await fetch(`http://localhost:5000/place-blind-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          playerName,
          bidAmount,
          bidderTeam: teamName
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Reset bid amount input
        setBidAmount(0);
      } else {
        setError(result.message || 'Failed to place blind bid');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error placing blind bid:', err);
    }
  };
  
  // Check if all blind bids are completed
  const checkBlindAuctionStatus = async () => {
    // Check if all players have bids or if time has expired
    const allBidsPlaced = Object.values(blindBids).every(bid => 
      bid.status === 'awarded' || bid.status === 'closed'
    );
    
    if (allBidsPlaced) {
      // Transition to main auction phase
      setAuctionPhase('main');
      await fetchNextPlayer();
    }
  };
  
  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  // Go back to room page
  const goBack = () => {
    router.push(`/room/${roomId}`);
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
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
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
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Enter your team name"
            className="flex-1 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>
      
      {/* Blind Auction Phase */}
      {auctionPhase === 'blind' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="col-span-full bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Blind Auction</h2>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-300" />
                <span className="text-yellow-300 font-medium">
                  Time Remaining: {formatTimeRemaining(5 * 60 * 1000)} {/* 5 minutes */}
                </span>
              </div>
            </div>
            <p className="text-gray-300 mb-4">
              Place your blind bids for each player. The highest bidder will win the player. 
              Other teams cannot see your bid amount until the blind auction phase ends.
            </p>
          </div>
          
          {blindBidPlayers.map((player) => (
            <div key={player.name} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col h-full">
              <div className="mb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white">{player.name}</h3>
                  <p className="text-gray-300">{player.team}</p>
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
              
              <div className="mt-auto">
                {blindBids[player.name]?.status === 'active' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm">
                        Total Bids: {blindBids[player.name]?.totalBids || 0}
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="100000"
                        value={bidAmount || ''}
                        onChange={(e) => setBidAmount(Number(e.target.value))}
                        placeholder="Enter bid amount"
                        className="flex-1 px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      />
                      <button
                        onClick={() => placeBlindBid(player.name)}
                        disabled={!teamName || bidAmount <= 0}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300"
                      >
                        Bid
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <Check className="w-5 h-5 text-green-400 mx-auto mb-2" />
                    <p className="text-gray-300">Bid Placed</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Main Auction Phase */}
      {auctionPhase === 'main' && currentPlayer && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Current Player Card */}
          <div className="md:col-span-1 bg-white/10 backdrop-blur-md rounded-2xl p-6">
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
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Current Highest Bid:</span>
                  <span className="text-green-300 font-bold">
                    ₹{currentBids.highestBid.amount.toLocaleString()}
                  </span>
                </div>
              )}
              
              {currentBids?.highestBid && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Highest Bidder:</span>
                  <span className="text-white font-medium">
                    {currentBids.highestBid.bidderTeam}
                  </span>
                </div>
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
          <div className="md:col-span-2 bg-white/10 backdrop-blur-md rounded-2xl p-6">
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
                <div className="flex flex-col md:flex-row gap-4">
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
              </div>
            ) : currentBids?.status === 'awarded' ? (
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
            ) : (
              <div className="bg-gray-800/50 rounded-xl p-6 text-center">
                <X className="w-8 h-8 text-red-400 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-white mb-2">
                  Bidding Closed
                </h3>
                <p className="text-gray-300">
                  No bids were placed for this player.
                </p>
              </div>
            )}
            
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
                      {currentBids.allBids.map((bid, index) => (
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

export default AuctionPage;