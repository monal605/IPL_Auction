'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trophy, Users, DollarSign, Target, Clock, Play, RefreshCw, Home } from 'lucide-react';

interface Player {
  name: string;
  team: string;
  type: string;
  basePrice?: number;
  boughtPrice: number;
  boughtAt: string;
}

interface Team {
  username: string;
  budget: number;
  players: Player[];
}

interface RoomData {
  roomID: string;
  users: Team[];
  budgetPerUser: number;
  soldPlayersCount: number;
  activeBidsCount: number;
  activeBlindBidsCount: number;
  createdAt: string;
  lastActivity: string;
}

interface RoomState {
  roomId: string;
  users: Array<{
    username: string;
    budget: number;
    spentAmount: number;
    players: Player[];
    playerCount: number;
    canBuyMore: boolean;
  }>;
  currentType: string;
  nextType: string;
  remainingPlayers: number;
  totalPlayersSent: number;
  blindBidPlayersCount: number;
  mainAuctionPlayersCount: number;
  soldPlayersCount: number;
  auctionPhase: string;
}

const RoomDashboard = () => {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoomData = async () => {
    if (!roomId) return;
    
    try {
      const [dataResponse, stateResponse] = await Promise.all([
        fetch(`http://localhost:5000/room-data/${roomId}`),
        fetch(`http://localhost:5000/room-state/${roomId}`)
      ]);

      const dataResult = await dataResponse.json();
      const stateResult = await stateResponse.json();

      if (dataResult.success && stateResult.success) {
        setRoomData(dataResult.data);
        setRoomState(stateResult.data);
        setError(null);
      } else {
        setError(dataResult.message || stateResult.message || 'Failed to fetch room data');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
      console.error('Error fetching room data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRoomData();
  };

  const joinAuction = () => {
    router.push(`/auction/${roomId}`);
  };

  const goHome = () => {
    router.push('/');
  };

  useEffect(() => {
    if (roomId) {
      fetchRoomData();
    }
  }, [roomId]);

  // Auto refresh every 10 seconds
  useEffect(() => {
    if (!roomId) return;
    
    const interval = setInterval(() => {
      if (!loading && !refreshing) {
        fetchRoomData();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [loading, refreshing, roomId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading room data...</p>
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
              onClick={handleRefresh}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
            >
              Try Again
            </button>
            <button
              onClick={goHome}
              className="bg-gray-500/20 hover:bg-gray-500/30 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getAuctionPhaseDisplay = () => {
    if (!roomState) return 'Unknown';
    
    switch (roomState.auctionPhase) {
      case 'blind_bidding':
        return 'Blind Bidding Phase';
      case 'main_auction':
        return 'Main Auction Phase';
      case 'completed':
        return 'Auction Completed';
      default:
        return 'Preparing Auction';
    }
  };

  const getPlayerTypeColor = (type: string) => {
    switch (type) {
      case 'BAT':
        return 'bg-green-500/20 text-green-300 border-green-400/30';
      case 'BOWL':
        return 'bg-red-500/20 text-red-300 border-red-400/30';
      case 'AR':
        return 'bg-purple-500/20 text-purple-300 border-purple-400/30';
      case 'WK':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-400/30';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN').format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-4 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-4 right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-4 left-1/2 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Trophy className="w-8 h-8 text-yellow-400 mr-3" />
            <div>
              <h1 className="text-3xl font-bold text-white">Room: {roomData?.roomID}</h1>
              <p className="text-gray-300">{getAuctionPhaseDisplay()}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white p-3 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={goHome}
              className="bg-gray-500/20 hover:bg-gray-500/30 text-white p-3 rounded-xl transition-all duration-300 backdrop-blur-sm border border-gray-400/30"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Auction Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Total Teams</p>
                <p className="text-2xl font-bold text-white">{roomData?.users.length || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Players Sold</p>
                <p className="text-2xl font-bold text-white">{roomState?.soldPlayersCount || 0}</p>
              </div>
              <Target className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Active Bids</p>
                <p className="text-2xl font-bold text-white">
                  {(roomData?.activeBidsCount || 0) + (roomData?.activeBlindBidsCount || 0)}
                </p>
              </div>
              <Clock className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Budget per Team</p>
                <p className="text-2xl font-bold text-white">₹{formatCurrency(roomData?.budgetPerUser || 0)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
        </div>

        {/* Teams Grid */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {roomState?.users.map((team, index) => (
            <div key={team.username} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mr-3">
                    {team.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{team.username}</h3>
                    <p className="text-gray-300 text-sm">
                      {team.playerCount}/16 players • ₹{formatCurrency(team.budget)} left
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    team.playerCount === 16 ? 'bg-green-500/20 text-green-300 border border-green-400/30' : 
                    team.canBuyMore ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' : 
                    'bg-red-500/20 text-red-300 border border-red-400/30'
                  }`}>
                    {team.playerCount === 16 ? 'Complete' : team.canBuyMore ? 'Active' : 'Budget Low'}
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-700/50 rounded-full h-2 mb-4">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(team.playerCount / 16) * 100}%` }}
                ></div>
              </div>

              {/* Players */}
              {team.players.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {team.players.map((player, playerIndex) => (
                    <div key={playerIndex} className="flex items-center justify-between bg-white/5 rounded-lg p-2">
                      <div className="flex items-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mr-2 border ${getPlayerTypeColor(player.type)}`}>
                          {player.type}
                        </span>
                        <span className="text-white font-medium">{player.name}</span>
                        <span className="text-gray-400 text-sm ml-2">({player.team})</span>
                      </div>
                      <span className="text-green-400 font-semibold">₹{formatCurrency(player.boughtPrice)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No players yet</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Section */}
        <div className="text-center">
          <div className="bg-gradient-to-br from-green-500/80 to-emerald-600/80 backdrop-blur-xl rounded-3xl p-8 border border-green-400/30 max-w-md mx-auto">
            <Play className="w-16 h-16 text-white mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-4">Ready to Bid?</h2>
            <p className="text-green-100 mb-6">
              {roomState?.auctionPhase === 'completed' 
                ? 'Auction has ended. View final results!' 
                : 'Join the auction and start building your dream team!'}
            </p>
            <button
              onClick={joinAuction}
              disabled={roomState?.auctionPhase === 'completed'}
              className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30 hover:border-white/50"
            >
              {roomState?.auctionPhase === 'completed' ? 'View Results' : 'Join Auction'}
            </button>
          </div>
        </div>

        {/* Room Info Footer */}
        <div className="mt-8 text-center text-gray-400 text-sm">
          <p>Room created: {roomData?.createdAt ? formatDate(roomData.createdAt) : 'Unknown'}</p>
          <p>Last activity: {roomData?.lastActivity ? formatDate(roomData.lastActivity) : 'Unknown'}</p>
        </div>
      </div>
    </div>
  );
};

export default RoomDashboard;