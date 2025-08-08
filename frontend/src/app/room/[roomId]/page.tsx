'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trophy, Users, UserPlus, Play, RefreshCw, Home, Crown } from 'lucide-react';

interface Team {
  teamName: string;
  users: string[];
  maxUsers: number;
}

interface RoomData {
  roomCode: string;
  teams: Team[];
  users: string[];
  players: any[];
}

interface UserInfo {
  roomID: string;
  teamName: string;
  username: string;
}

const TeamSelectionPage = () => {
  const router = useRouter();
  const params = useParams();
  const roomID = params.roomID as string;
  
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [joining, setJoining] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const fetchRoomData = async () => {
    if (!roomID) return;
    
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/room-data/${roomID}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();

      if (result.success) {
        setRoomData(result.data);
        setError(null);
      } else {
        throw new Error(result.message || 'Failed to fetch room data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch room data');
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

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (!selectedTeam) {
      setError('Please select a team');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/join-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          roomCode: roomID,
          teamName: selectedTeam
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        const userData: UserInfo = {
          roomID,
          teamName: selectedTeam,
          username: username.trim()
        };
        
        localStorage.setItem('userInfo', JSON.stringify(userData));
        setUserInfo(userData);
        setJoinSuccess(true);
        await fetchRoomData();
      } else {
        throw new Error(result.message || 'Failed to join team');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
      console.error('Error joining team:', err);
    } finally {
      setJoining(false);
    }
  };

  const goToAuction = () => {
    if (userInfo) {
      router.push(`/auction/${roomID}`);
    }
  };

  const goHome = () => {
    router.push('/');
  };

  const leaveTeam = () => {
    localStorage.removeItem('userInfo');
    setUserInfo(null);
    setJoinSuccess(false);
    setSelectedTeam('');
    setUsername('');
    fetchRoomData();
  };

  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const userData = JSON.parse(storedUserInfo) as UserInfo;
        if (userData.roomID === roomID) {
          setUserInfo(userData);
          setJoinSuccess(true);
          setSelectedTeam(userData.teamName);
          setUsername(userData.username);
        }
      } catch (err) {
        console.error('Error parsing stored user info:', err);
        localStorage.removeItem('userInfo');
      }
    }
  }, [roomID]);

  useEffect(() => {
    if (roomID) {
      fetchRoomData();
    }
  }, [roomID]);

  useEffect(() => {
    if (!roomID) return;
    
    const interval = setInterval(() => {
      if (!loading && !refreshing && !joining) {
        fetchRoomData();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [loading, refreshing, joining, roomID]);

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

  if (error && !roomData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-red-500/20 backdrop-blur-lg rounded-2xl p-8 border border-red-400/30 text-center max-w-md">
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

  const getTeamStatus = (team: Team) => {
    const userCount = team.users.length;
    const maxUsers = team.maxUsers;
    
    if (userCount >= maxUsers) return { text: 'Full', color: 'bg-red-500/20 text-red-300 border-red-400/30' };
    if (userCount > 0) return { text: 'Active', color: 'bg-green-500/20 text-green-300 border-green-400/30' };
    return { text: 'Empty', color: 'bg-gray-500/20 text-gray-300 border-gray-400/30' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-4 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-4 right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-4 left-1/2 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Trophy className="w-8 h-8 text-yellow-400 mr-3" />
            <div>
              <h1 className="text-3xl font-bold text-white">Team Selection</h1>
              <p className="text-gray-300">Room: {roomData?.roomCode}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white p-3 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={goHome}
              className="bg-gray-500/20 hover:bg-gray-500/30 text-white p-3 rounded-xl transition-all duration-300 backdrop-blur-sm border border-gray-400/30"
              aria-label="Go Home"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Success Message */}
        {joinSuccess && userInfo && (
          <div className="bg-green-500/20 backdrop-blur-lg rounded-2xl p-6 border border-green-400/30 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Crown className="w-6 h-6 text-green-400 mr-3" />
                <div>
                  <h3 className="text-xl font-bold text-white">Welcome to Team {userInfo.teamName}!</h3>
                  <p className="text-green-200">Joined as: {userInfo.username}</p>
                </div>
              </div>
              <button
                onClick={leaveTeam}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-all duration-300 border border-red-400/30"
              >
                Leave Team
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 backdrop-blur-lg rounded-2xl p-4 border border-red-400/30 mb-8">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Teams List */}
          <section className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Users className="w-6 h-6 mr-2" />
              Available Teams
            </h2>
            
            <div className="space-y-4">
              {roomData?.teams.map((team) => {
                const status = getTeamStatus(team);
                const isSelected = selectedTeam === team.teamName;
                const isUserInThisTeam = userInfo?.teamName === team.teamName;
                
                return (
                  <div
                    key={team.teamName}
                    className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border transition-all duration-300 cursor-pointer ${
                      isSelected 
                        ? 'border-blue-400/50 bg-blue-500/20' 
                        : isUserInThisTeam 
                          ? 'border-green-400/50 bg-green-500/20'
                          : 'border-white/20 hover:border-white/40'
                    }`}
                    onClick={() => !joinSuccess && setSelectedTeam(team.teamName)}
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4">
                          {team.teamName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">{team.teamName}</h3>
                          <p className="text-gray-300">
                            {team.users.length}/{team.maxUsers} members
                            {isUserInThisTeam && <span className="text-green-400 ml-2">(Your Team)</span>}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${status.color}`}>
                        {status.text}
                      </span>
                    </div>

                    {/* Team Members */}
                    {team.users.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-gray-400 text-sm font-medium">Members:</p>
                        <div className="flex flex-wrap gap-2">
                          {team.users.map((user) => (
                            <span
                              key={user}
                              className={`inline-block px-3 py-1 rounded-full text-xs border ${
                                user === userInfo?.username
                                  ? 'bg-green-500/20 text-green-300 border-green-400/30'
                                  : 'bg-white/10 text-white border-white/20'
                              }`}
                            >
                              {user} {user === userInfo?.username && '(You)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selection Indicator */}
                    {isSelected && !joinSuccess && (
                      <div className="mt-4 flex items-center text-blue-300">
                        <UserPlus className="w-4 h-4 mr-2" />
                        <span className="text-sm">Selected for joining</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Join Team Form or Go to Auction */}
          <aside className="lg:col-span-1">
            {!joinSuccess ? (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 sticky top-8">
                <h2 className="text-xl font-bold text-white mb-6">Join a Team</h2>
                
                <form onSubmit={handleJoinTeam} className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-gray-300 text-sm font-medium mb-2">
                      Your Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-400/50 focus:bg-white/10"
                      required
                      minLength={2}
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Selected Team
                    </label>
                    <div className="bg-white/5 border border-white/20 rounded-lg px-4 py-3 min-h-[3rem]">
                      {selectedTeam ? (
                        <span className="text-white">{selectedTeam}</span>
                      ) : (
                        <span className="text-gray-400">Click on a team above to select</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedTeam || !username.trim() || joining}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
                  >
                    {joining ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Joining...
                      </div>
                    ) : (
                      'Join Team'
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-600/20 backdrop-blur-lg rounded-2xl p-6 border border-green-400/30 sticky top-8">
                <Play className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white text-center mb-2">Ready to Start!</h2>
                <p className="text-green-200 text-center mb-6">
                  You've successfully joined Team {userInfo?.teamName}. Time to build your dream squad!
                </p>
                
                <button
                  onClick={goToAuction}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Go to Auction
                </button>
              </div>
            )}
          </aside>
        </div>

        {/* Room Info */}
        <footer className="mt-12 text-center">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">Room Information</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Room Code</p>
                <p className="text-white font-semibold">{roomData?.roomCode}</p>
              </div>
              <div>
                <p className="text-gray-400">Total Teams</p>
                <p className="text-white font-semibold">{roomData?.teams.length}</p>
              </div>
              <div>
                <p className="text-gray-400">Total Players</p>
                <p className="text-white font-semibold">{roomData?.users.length}</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TeamSelectionPage;