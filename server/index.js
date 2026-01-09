const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());

// Game rooms storage
const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let currentRoom = null;

  // Create room
  socket.on('create-room', (roomCode) => {
    rooms[roomCode] = {
      players: [],
      buzzedPlayer: null,
      lockedPlayers: new Set(),
      gameStarted: false,
      activePlayerId: null // NEW - Track active player
    };
    currentRoom = roomCode;
    socket.join(roomCode);
    console.log(`Room created: ${roomCode}`);
  });

  // Check if player already exists (for reconnection)
  socket.on('check-rejoin', ({ roomCode, playerName, playerIcon }) => {
    if (!rooms[roomCode]) {
      socket.emit('room-not-found');
      return;
    }

    const existingPlayer = rooms[roomCode].players.find(
      p => p.name === playerName && p.icon === playerIcon
    );

    if (existingPlayer) {
      // Player exists - update their socket ID
      existingPlayer.id = socket.id;
      currentRoom = roomCode;
      socket.join(roomCode);
      socket.emit('rejoin-success', existingPlayer);
      io.to(roomCode).emit('players-update', rooms[roomCode].players);
      
      // NEW - Send active player to reconnecting client
      if (rooms[roomCode].activePlayerId) {
        socket.emit('active-player-update', rooms[roomCode].activePlayerId);
      }
      
      console.log(`${playerName} reconnected to room ${roomCode}`);
    } else {
      socket.emit('rejoin-failed');
    }
  });

  // Player joins
  socket.on('join-game', (playerData) => {
    const roomCode = playerData.roomCode || 'GAME123';
    currentRoom = roomCode;

    if (!rooms[roomCode]) {
      rooms[roomCode] = { 
        players: [], 
        buzzedPlayer: null, 
        lockedPlayers: new Set(),
        gameStarted: false,
        activePlayerId: null // NEW
      };
    }

    // Check if player already exists (prevent duplicates)
    const existingPlayer = rooms[roomCode].players.find(
      p => p.name === playerData.name && p.icon === playerData.icon
    );

    if (existingPlayer) {
      // Update existing player's socket ID
      existingPlayer.id = socket.id;
      socket.join(roomCode);
      io.to(roomCode).emit('players-update', rooms[roomCode].players);
      
      // NEW - Send active player to reconnecting client
      if (rooms[roomCode].activePlayerId) {
        socket.emit('active-player-update', rooms[roomCode].activePlayerId);
      }
      
      console.log(`${playerData.name} reconnected (duplicate prevented)`);
      return;
    }

    const player = {
      id: socket.id,
      name: playerData.name,
      icon: playerData.icon,
      score: 0
    };
    
    rooms[roomCode].players.push(player);
    socket.join(roomCode);
    io.to(roomCode).emit('players-update', rooms[roomCode].players);
    console.log(`${playerData.name} joined room ${roomCode} (${rooms[roomCode].players.length} players)`);
  });

  // NEW - Set active player (host updates)
  socket.on('set-active-player', (roomCode, playerId) => {
    if (rooms[roomCode]) {
      rooms[roomCode].activePlayerId = playerId;
      io.to(roomCode).emit('active-player-update', playerId);
      console.log(`Active player set to ${playerId} in room ${roomCode}`);
    }
  });

  // Kick player (host only, waiting room only)
  socket.on('kick-player', ({ roomCode, playerId }) => {
    if (!rooms[roomCode] || rooms[roomCode].gameStarted) return;
    
    rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== playerId);
    
    // NEW - If kicked player was active, clear active player
    if (rooms[roomCode].activePlayerId === playerId) {
      rooms[roomCode].activePlayerId = null;
      io.to(roomCode).emit('active-player-update', null);
    }
    
    io.to(playerId).emit('kicked-from-room');
    io.to(roomCode).emit('players-update', rooms[roomCode].players);
    console.log(`Player ${playerId} kicked from room ${roomCode}`);
  });

  // Player buzzes
  socket.on('buzz', () => {
    if (currentRoom && rooms[currentRoom]) {
      if (rooms[currentRoom].lockedPlayers.has(socket.id)) {
        console.log('Locked player attempted to buzz:', socket.id);
        return;
      }
      if (!rooms[currentRoom].buzzedPlayer) {
        rooms[currentRoom].buzzedPlayer = socket.id;
        io.to(currentRoom).emit('player-buzzed', socket.id);
        console.log('Player buzzed:', socket.id);
      }
    }
  });

  socket.on('lock-player', (playerIdToLock) => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].lockedPlayers.add(playerIdToLock);
      io.to(playerIdToLock).emit('player-locked');
      console.log(`Player ${playerIdToLock} locked out in room ${currentRoom}`);
    }
  });

  // Reset buzzer
  socket.on('full-reset', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].buzzedPlayer = null;
      rooms[currentRoom].lockedPlayers = new Set();
      io.to(currentRoom).emit('buzzer-reset');
      io.to(currentRoom).emit('full-reset-complete');
      io.to(currentRoom).emit('lock-status-update', { isLocked: false });
      console.log('Full reset (buzz and lockouts) in room:', currentRoom);
    }
  });

  socket.on('clear-buzz-only', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].buzzedPlayer = null; 
      io.to(currentRoom).emit('buzzer-reset');
      console.log('Buzz winner cleared in room:', currentRoom);
    }
  });

  // Update scores
  socket.on('update-scores', (updatedPlayers) => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].players = updatedPlayers;
      io.to(currentRoom).emit('players-update', updatedPlayers);
    }
  });

  // Start game
  socket.on('start-game', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].gameStarted = true;
      io.to(currentRoom).emit('game-started');
      console.log('Game started in room:', currentRoom);
    }
  });

  // Final Jeopardy: Submit Wager
  socket.on('submit-wager', ({ roomCode, playerId, wager }) => {
    console.log(`Player ${playerId} wagered $${wager}`);
    io.to(roomCode).emit('wager-submitted', { playerId, wager });
  });

  // Final Jeopardy: Submit Answer
  socket.on('submit-final-answer', ({ roomCode, playerId, answer }) => {
    console.log(`Player ${playerId} answered: ${answer}`);
    io.to(roomCode).emit('final-answer-submitted', { playerId, answer });
  });

  // Final Jeopardy: Start Wagering
  socket.on('start-final-wagering', (roomCode) => {
    const room = rooms[roomCode];
    if (room) {
      room.players.forEach(player => {
        io.to(player.id).emit('start-final-wagering', { 
          playerScore: player.score,
          maxWager: Math.abs(player.score)
        });
      });
      console.log(`Final Jeopardy wagering started in room ${roomCode}`);
    }
  });

  // Final Jeopardy: Start Question
  socket.on('start-final-question', (roomCode) => {
    io.to(roomCode).emit('start-final-question');
    console.log(`Final Jeopardy question revealed in room ${roomCode}`);
  });

  // Disconnect - Keep player in list (can reconnect)
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Player stays in the room - can reconnect
  });
});

// Serve static files for production
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve buzzer page
app.get('/buzzer', (req, res) => {
  res.sendFile(path.join(__dirname, '../buzzer/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
