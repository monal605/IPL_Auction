'use client';
import React, { useState } from 'react';
import { Users, Trophy, Plus, Link, Zap, Timer, DollarSign, UserPlus, Settings } from 'lucide-react';

const AuctionLandingPage = () => {
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinTeamName, setJoinTeamName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  // Create room states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createRoomId, setCreateRoomId] = useState('');
  const [teamNames, setTeamNames] = useState(['']);
  const [budgetPerUser, setBudgetPerUser] = useState(95000000);
  const [isCreating, setIsCreating] = useState(false);
  
  // Backend API base URL
  const API_BASE_URL = 'http://localhost:5000';
  
  const handleJoinRoom = async () => {
    if (!joinRoomId.trim() || !joinTeamName.trim()) return;
    
    setIsJoining(true);
    try {
      const response = await fetch(`${API_BASE_URL}/join-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomID: joinRoomId.trim(),
          teamName: joinTeamName.trim()
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Redirect to the room on successful join
        window.location.href = `/room/${joinRoomId}`;
      } else {
        alert(data.message || 'Failed to join room');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Network error. Please check if the server is running on port 5000.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!createRoomId.trim() || teamNames.filter(name => name.trim()).length < 2) {
      alert('Please provide a room ID and at least 2 team names');
      return;
    }
    
    setIsCreating(true);
    try {
      const validTeamNames = teamNames.filter(name => name.trim());
      
      const response = await fetch(`${API_BASE_URL}/create-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: createRoomId.trim(),
          users: validTeamNames.map(name => name.trim()),
          budgetPerUser: budgetPerUser
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Room "${data.roomId}" created successfully with ${data.users.length} teams!`);
        // Redirect to the newly created room
        window.location.href = `/room/${data.roomId}`;
      } else {
        alert(data.message || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Network error. Please check if the server is running on port 5000.');
    } finally {
      setIsCreating(false);
    }
  };

  const addTeamField = () => {
    setTeamNames([...teamNames, '']);
  };

  const removeTeamField = (index: number) => {
    if (teamNames.length > 1) {
      setTeamNames(teamNames.filter((_, i) => i !== index));
    }
  };

  const updateTeamName = (index: number, value: string) => {
    const updated = [...teamNames];
    updated[index] = value;
    setTeamNames(updated);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-4 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-4 right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-4 left-1/2 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Trophy className="w-16 h-16 text-yellow-400 mr-4" />
            <h1 className="text-6xl font-bold text-white">
              Fan<span className="text-yellow-400">Auction</span>
            </h1>
          </div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Create your dream team in our interactive fantasy sports auction. 
            Bid smart, build strong, and dominate the league!
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <Zap className="w-12 h-12 text-yellow-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Real-time Bidding</h3>
            <p className="text-gray-300">Live auction experience with instant updates and competitive bidding</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <Timer className="w-12 h-12 text-blue-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Batch System</h3>
            <p className="text-gray-300">Organized player releases in strategic batches by position</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <DollarSign className="w-12 h-12 text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Budget Management</h3>
            <p className="text-gray-300">Smart budget tracking with spending analytics and alerts</p>
          </div>
        </div>

        {/* Main action cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Create Room Card */}
          <div className="group">
            <div className="bg-gradient-to-br from-green-500/80 to-emerald-600/80 backdrop-blur-xl rounded-3xl p-8 border border-green-400/30 hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/25">
              <div className="text-center">
                <div className="bg-white/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:rotate-12 transition-transform duration-300">
                  <Plus className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Create Room</h2>
                <p className="text-green-100 mb-8 text-lg">
                  Start a new auction with your friends. Set up teams, budgets, and get ready to bid!
                </p>
                
                {!showCreateForm ? (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="bg-white/20 hover:bg-white/30 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30 hover:border-white/50 hover:shadow-lg"
                  >
                    <Settings className="w-5 h-5 inline mr-2" />
                    Setup New Room
                  </button>
                ) : (
                  <div className="space-y-4 text-left">
                    {/* Room ID Input */}
                    <div>
                      <label className="block text-green-100 text-sm font-medium mb-2">Room ID</label>
                      <input
                        type="text"
                        placeholder="e.g., ipl-auction-2024"
                        value={createRoomId}
                        onChange={(e) => setCreateRoomId(e.target.value)}
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                      />
                    </div>
                    
                    {/* Budget Input */}
                    <div>
                      <label className="block text-green-100 text-sm font-medium mb-2">Budget per Team</label>
                      <input
                        type="number"
                        value={budgetPerUser}
                        onChange={(e) => setBudgetPerUser(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                      />
                    </div>
                    
                    {/* Team Names */}
                    <div>
                      <label className="block text-green-100 text-sm font-medium mb-2">Team Names</label>
                      {teamNames.map((name, index) => (
                        <div key={index} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            placeholder={`Team ${index + 1} name`}
                            value={name}
                            onChange={(e) => updateTeamName(index, e.target.value)}
                            className="flex-1 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                          />
                          {teamNames.length > 1 && (
                            <button
                              onClick={() => removeTeamField(index)}
                              className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 border border-red-400/30"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={addTeamField}
                        className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg text-green-200 transition-all duration-300"
                      >
                        <UserPlus className="w-4 h-4 inline mr-2" />
                        Add Team
                      </button>
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setShowCreateForm(false)}
                        className="flex-1 bg-gray-500/20 hover:bg-gray-500/30 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 backdrop-blur-sm border border-gray-400/30"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateRoom}
                        disabled={isCreating || !createRoomId.trim()}
                        className="flex-1 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30 hover:border-white/50"
                      >
                        {isCreating ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Creating...
                          </div>
                        ) : (
                          'Create Room'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Join Room Card */}
          <div className="group">
            <div className="bg-gradient-to-br from-blue-500/80 to-purple-600/80 backdrop-blur-xl rounded-3xl p-8 border border-blue-400/30 hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/25">
              <div className="text-center">
                <div className="bg-white/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:rotate-12 transition-transform duration-300">
                  <Users className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Join Room</h2>
                <p className="text-blue-100 mb-8 text-lg">
                  Got an invitation? Enter the room ID and your team name to join the auction!
                </p>
                
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter Room ID"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      className="w-full px-6 py-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                    <Link className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-300" />
                  </div>
                  
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Your Team Name"
                      value={joinTeamName}
                      onChange={(e) => setJoinTeamName(e.target.value)}
                      className="w-full px-6 py-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                    />
                    <Users className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-300" />
                  </div>
                  
                  <button
                    onClick={handleJoinRoom}
                    disabled={!joinRoomId.trim() || !joinTeamName.trim() || isJoining}
                    className="w-full bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/30 hover:border-white/50 hover:shadow-lg disabled:border-white/20"
                  >
                    {isJoining ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Joining...
                      </div>
                    ) : (
                      'Join Room'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold text-white mb-8">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="bg-blue-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Create/Join</h3>
              <p className="text-gray-400 text-sm">Set up your auction room with friends</p>
            </div>
            <div className="text-center">
              <div className="bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-400">2</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Blind Bids</h3>
              <p className="text-gray-400 text-sm">Start with secret blind bidding phase</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-400">3</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Live Auction</h3>
              <p className="text-gray-400 text-sm">Bid on players in organized batches</p>
            </div>
            <div className="text-center">
              <div className="bg-yellow-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-yellow-400">4</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Build Team</h3>
              <p className="text-gray-400 text-sm">Complete your squad within budget</p>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="mt-16 text-center text-gray-400">
          <p>&copy; 2025 FanAuction. Built for fantasy sports enthusiasts.</p>
        </div>
      </div>
    </div>
  );
};

export default AuctionLandingPage;