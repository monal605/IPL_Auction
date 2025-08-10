import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clock, DollarSign, Trophy, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// --- API Configuration ---
const API_BASE_URL = 'http://localhost:5000';

// --- Type definitions ---
type PlayerType = 'BAT' | 'BOWL' | 'AR' | 'WK';
type AuctionPhase = 'blind' | 'main' | 'completed';
type BidStatus = 'active' | 'closed' | 'sold' | 'awarded';

interface AuctionPlayer {
  name: string;
  team: string;
  type: PlayerType;
  basePrice?: number;
}

interface BlindBidPlayer {
  name: string;
  team: string;
  type: PlayerType;
}

interface Bid {
  bidderTeam: string;
  amount: number;
  timestamp: string;
  bidId?: string;
}

interface PlayerBid {
  playerName: string;
  playerType: PlayerType;
  basePrice?: number;
  highestBid?: Bid;
  totalBids: number;
  biddingStartTime: string;
  timeRemaining: number;
  status: BidStatus;
  allBids?: Bid[];
}

interface ApiResponse {
  success: boolean;
  message?: string;
  players?: AuctionPlayer[] | BlindBidPlayer[];
  data?: any;
}

// --- Error Boundary Component ---
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

// --- Blind Player Bidding Component ---
const BlindPlayerBidding: React.FC<{
  roomID: string;
  teamName: string;
  onBidsSubmitted: () => void;
  setError: (error: string | null) => void;
}> = ({ roomID, teamName, onBidsSubmitted, setError }) => {
  const [availablePlayers, setAvailablePlayers] = useState<BlindBidPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [bidAmounts, setBidAmounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/blind-bid-players`);
        if (!response.ok) throw new Error('Failed to fetch players for blind bidding.');
        
        const data: ApiResponse = await response.json();
        
        if (data.success && data.players) {
          setAvailablePlayers(data.players as BlindBidPlayer[]);
        } else {
          throw new Error(data.message || 'Could not parse player data.');
        }
        setError(null);
      } catch (error: any) {
        console.error('Failed to fetch blind bid players:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayers();
  }, [setError]);

  const handlePlayerSelect = (playerName: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerName) 
        ? prev.filter(p => p !== playerName) 
        : prev.length < 5 ? [...prev, playerName] : prev
    );
    
    if (!selectedPlayers.includes(playerName)) {
      setBidAmounts(prev => ({ ...prev, [playerName]: 1000000 }));
    } else {
      setBidAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[playerName];
        return newAmounts;
      });
    }
  };

  const handleBidAmountChange = (playerName: string, amount: number) => {
    setBidAmounts(prev => ({ ...prev, [playerName]: amount }));
  };

  const submitBlindBids = async () => {
    setSubmitting(true);
    setError(null);
    
    try {
      const bidsToSubmit = selectedPlayers.map(playerName => ({
        playerName,
        bidAmount: bidAmounts[playerName] || 1000000,
      }));

      const responses = await Promise.all(
        bidsToSubmit.map(bid => 
          fetch(`${API_BASE_URL}/place-blind-bid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: roomID,
              playerName: bid.playerName,
              bidAmount: bid.bidAmount,
              bidderTeam: teamName,
            }),
          })
        )
      );

      const results = await Promise.all(responses.map(res => res.json()));
      const failed = results.filter(result => !result.success);

      if (failed.length > 0) {
        throw new Error(`${failed.length} bids failed to submit`);
      }
      
      onBidsSubmitted();
    } catch (error: any) {
      console.error('Failed to submit blind bids:', error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading Players...</p>
      </div>
    );
  }

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
            const typeColors = {
              BAT: 'bg-blue-500/20 text-blue-300',
              BOWL: 'bg-green-500/20 text-green-300',
              AR: 'bg-purple-500/20 text-purple-300',
              WK: 'bg-yellow-500/20 text-yellow-300',
            };
            
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
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${typeColors[player.type]}`}>
                    {player.type}
                  </span>
                </div>
                
                {isSelected && (
                  <div className="mt-3">
                    <label className="block text-gray-300 text-sm mb-1">Bid Amount (₹)</label>
                    <input
                      type="number"
                      min="100000"
                      step="100000"
                      value={bidAmounts[player.name] || ''}
                      onChange={(e) => handleBidAmountChange(player.name, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {selectedPlayers.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/20">
            <button
              onClick={submitBlindBids}
              disabled={submitting || !teamName}
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

// --- Main Auction System Component ---
const MainAuctionSystem: React.FC<{
  roomId: string;
  teamName: string;
  socket: Socket | null;
  onAuctionComplete: () => void;
  setError: (error: string | null) => void;
}> = ({ roomId, teamName, socket, onAuctionComplete, setError }) => {
  const [currentPlayer, setCurrentPlayer] = useState<AuctionPlayer | null>(null);
  const [currentBids, setCurrentBids] = useState<PlayerBid | null>(null);
  const [playerQueue, setPlayerQueue] = useState<AuctionPlayer[]>([]);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isLoadingNextPlayer, setIsLoadingNextPlayer] = useState(false);

  const fetchNextBatch = useCallback(async () => {
    try {
      setIsLoadingNextPlayer(true);
      const response = await fetch(`${API_BASE_URL}/next-batch/${roomId}`);
      if (!response.ok) throw new Error('Failed to fetch the next batch of players.');
      
      const data: ApiResponse = await response.json();
      if (data.success && data.players && data.players.length > 0) {
        setPlayerQueue(data.players as AuctionPlayer[]);
        return data.players as AuctionPlayer[];
      } else {
        onAuctionComplete();
        return [];
      }
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoadingNextPlayer(false);
    }
  }, [roomId, setError, onAuctionComplete]);

  const startBiddingForPlayer = useCallback(async (player: AuctionPlayer) => {
    try {
      const response = await fetch(`${API_BASE_URL}/start-bidding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, playerName: player.name }),
      });
      
      if (!response.ok) throw new Error(`Could not start bidding for ${player.name}.`);
      
      const bidData = await response.json();
      if (!bidData.success) throw new Error(bidData.message);
      
      setCurrentPlayer(player);
      setCurrentBids({
        playerName: player.name,
        playerType: player.type,
        basePrice: player.basePrice,
        highestBid: bidData.highestBid,
        totalBids: bidData.totalBids || 0,
        biddingStartTime: bidData.biddingStartTime,
        timeRemaining: bidData.timeRemaining || 60000,
        status: 'active',
        allBids: bidData.allBids || []
      });
      setRemainingTime(bidData.timeRemaining || 60000);
    } catch (err: any) {
      setError(err.message);
    }
  }, [roomId, setError]);

  const getNextPlayer = useCallback(async () => {
    if (playerQueue.length > 0) {
      const next = playerQueue[0];
      setPlayerQueue(prev => prev.slice(1));
      await startBiddingForPlayer(next);
    } else {
      const newBatch = await fetchNextBatch();
      if (newBatch && newBatch.length > 0) {
        const next = newBatch[0];
        setPlayerQueue(newBatch.slice(1));
        await startBiddingForPlayer(next);
      }
    }
  }, [playerQueue, fetchNextBatch, startBiddingForPlayer]);

  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/room-bids/${roomId}`);
        const data: ApiResponse = await response.json();
        
        if (data.success && data.data?.regularBids?.length > 0) {
          const activeBid = data.data.regularBids[0];
          setCurrentBids(activeBid);
          setCurrentPlayer({
            name: activeBid.playerName,
            type: activeBid.playerType,
            basePrice: activeBid.basePrice,
            team: ''
          });
          setRemainingTime(activeBid.timeRemaining);
        } else {
          await getNextPlayer();
        }
      } catch (err: any) {
        setError("Could not load current auction data.");
      }
    };
    
    fetchInitialState();

    if (!socket) return;
    
    const handleNewBid = (bidData: PlayerBid) => {
      setCurrentBids(bidData);
      setRemainingTime(bidData.timeRemaining);
    };
    
    const handlePlayerSold = (soldData: { playerName: string, winningBid: Bid }) => {
      setCurrentBids(prev => prev ? { 
        ...prev, 
        status: 'sold', 
        highestBid: soldData.winningBid 
      } : null);
      setTimeout(() => getNextPlayer(), 5000);
    };
    
    socket.on('new-bid', handleNewBid);
    socket.on('player-sold', handlePlayerSold);
    socket.on('phase-change', (newPhase: AuctionPhase) => {
      if (newPhase === 'completed') {
        onAuctionComplete();
      }
    });

    return () => {
      socket.off('new-bid', handleNewBid);
      socket.off('player-sold', handlePlayerSold);
      socket.off('phase-change');
    };
  }, [socket, roomId, setError, getNextPlayer, onAuctionComplete]);

  const placeBid = async () => {
    if (!currentPlayer || !teamName || bidAmount <= 0 || !socket) return;
    
    try {
      socket.emit('place-bid', {
        roomId,
        playerName: currentPlayer.name,
        bidAmount,
        bidderTeam: teamName,
      });
      
      setBidAmount(0);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!currentPlayer || !currentBids) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading next player...</p>
      </div>
    );
  }

  const typeColors = {
    BAT: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
    BOWL: { bg: 'bg-green-500/20', text: 'text-green-300' },
    AR: { bg: 'bg-purple-500/20', text: 'text-purple-300' },
    WK: { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <div className="mb-4">
          <span className={`inline-block px-3 py-1 rounded-lg text-sm font-medium mb-2 ${
            typeColors[currentPlayer.type].bg} ${typeColors[currentPlayer.type].text}`}>
            {currentPlayer.type}
          </span>
          <h2 className="text-2xl font-bold text-white">{currentPlayer.name}</h2>
          <p className="text-gray-300">{currentPlayer.team}</p>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Base Price:</span>
            <span className="text-white font-medium">
              ₹{currentPlayer.basePrice?.toLocaleString() || '0'}
            </span>
          </div>
          
          {currentBids.highestBid && (
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
              {currentBids.totalBids || 0}
            </span>
          </div>
        </div>
      </div>
      
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
        
        {currentBids.status === 'active' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="number"
                min={(currentBids.highestBid?.amount || currentPlayer.basePrice || 0) + 100000}
                step="100000"
                value={bidAmount || ''}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                placeholder={`Minimum bid: ₹${(
                  (currentBids.highestBid?.amount || currentPlayer.basePrice || 0) + 100000
                ).toLocaleString()}`}
                className="flex-1 px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              
              <button
                onClick={placeBid}
                disabled={!teamName || bidAmount <= 0 || 
                  (currentBids.highestBid && bidAmount <= currentBids.highestBid.amount)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300"
              >
                Place Bid
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
        
        {currentBids.allBids && currentBids.allBids.length > 0 && (
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
                  {[...currentBids.allBids].reverse().map((bid, index) => (
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

// --- Main Auction Page Component ---
const AuctionPage: React.FC = () => {
  const [auctionPhase, setAuctionPhase] = useState<AuctionPhase>('blind');
  const [teamName, setTeamName] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [bidsSubmitted, setBidsSubmitted] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  
  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const userInfo = JSON.parse(storedUserInfo);
        if (userInfo.teamName) {
          setTeamName(userInfo.teamName);
          setTeamId(userInfo.teamName.toLowerCase().replace(/\s+/g, '-'));
        }
      } catch (err) {
        console.error('Failed to parse user info', err);
      }
    }
    
    const fetchRoomState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/room-state/${roomId}`);
        if (!response.ok) throw new Error('Could not connect to the auction room.');
        
        const data: ApiResponse = await response.json();
        if (data.success && data.data?.auctionPhase) {
          setAuctionPhase(data.data.auctionPhase as AuctionPhase);
        } else {
          throw new Error(data.message || 'Invalid room state');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRoomState();

    // Initialize socket connection
    socketRef.current = io(API_BASE_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const socket = socketRef.current;

    const handleConnect = () => {
      setConnected(true);
      socket.emit('join-room', roomId);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handlePhaseChange = (newPhase: AuctionPhase) => {
      setAuctionPhase(newPhase);
    };

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
      setError('Connection error - attempting to reconnect...');
    };

    // Set up event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('phase-change', handlePhaseChange);
    socket.on('connect_error', handleConnectError);

    // Cleanup function
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('phase-change', handlePhaseChange);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const handleTeamNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setTeamName(newName);
    setTeamId(newName.toLowerCase().replace(/\s+/g, '-'));
    localStorage.setItem('userInfo', JSON.stringify({ teamName: newName }));
  };

  const handleBlindBidsSubmitted = () => {
    setBidsSubmitted(true);
  };
  
  const handleAuctionComplete = () => {
    setAuctionPhase('completed');
  };
  
  const goBack = () => {
    router.back();
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Connecting to auction...</p>
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
          <button
            onClick={() => window.location.reload()}
            className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4 md:p-8">
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
            Phase: {auctionPhase.charAt(0).toUpperCase() + auctionPhase.slice(1)}
          </div>
        </div>
      </div>
      
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <label className="text-white font-medium">Your Team Name:</label>
          <input
            type="text"
            value={teamName}
            onChange={handleTeamNameChange}
            disabled={bidsSubmitted || auctionPhase !== 'blind'}
            placeholder="Enter your team name to participate"
            className="flex-1 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-700/50 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      
      <AuctionErrorBoundary>
        {auctionPhase === 'blind' ? (
          <BlindPlayerBidding
            roomID={roomId}
            teamName={teamName}
            onBidsSubmitted={handleBlindBidsSubmitted}
            setError={setError}
          />
        ) : auctionPhase === 'main' ? (
          <MainAuctionSystem
            roomId={roomId}
            teamName={teamName}
            socket={socketRef.current}
            onAuctionComplete={handleAuctionComplete}
            setError={setError}
          />
        ) : (
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
      </AuctionErrorBoundary>
    </div>
  );
};

export default AuctionPage;
export { AuctionErrorBoundary, BlindPlayerBidding, MainAuctionSystem };