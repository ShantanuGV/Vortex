import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend build if present
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Room state storage: roomId -> Map(socketId -> { userName, isAudioMuted, isVideoOff })
const rooms = new Map();

// REST health check & room query
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.json({ exists: false, participants: 0 });
  }
  return res.json({
    exists: true,
    participants: room.size,
    members: Array.from(room.values())
  });
});

io.on('connection', (socket) => {
  console.log(`[Signaling] Peer connected: ${socket.id}`);

  // 1. Join a Meeting Room
  socket.on('join-room', ({ roomId, userName, isAudioMuted = false, isVideoOff = false }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName || `User-${socket.id.slice(0, 4)}`;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const roomParticipants = rooms.get(roomId);
    
    // Get list of existing peers in the room before adding the new peer
    const existingPeers = [];
    roomParticipants.forEach((info, peerId) => {
      existingPeers.push({
        peerId,
        userName: info.userName,
        isAudioMuted: info.isAudioMuted,
        isVideoOff: info.isVideoOff
      });
    });

    // Save current user state
    roomParticipants.set(socket.id, {
      userName: socket.userName,
      isAudioMuted,
      isVideoOff
    });

    console.log(`[Signaling] ${socket.userName} (${socket.id}) joined room "${roomId}". Total: ${roomParticipants.size}`);

    // Send existing peers to newly joined user
    socket.emit('all-peers', existingPeers);

    // Notify all existing users that a new peer joined
    socket.to(roomId).emit('user-joined', {
      peerId: socket.id,
      userName: socket.userName,
      isAudioMuted,
      isVideoOff
    });
  });

  // 2. WebRTC SDP Offer Relay
  socket.on('offer', ({ targetPeerId, sdp }) => {
    io.to(targetPeerId).emit('offer', {
      callerPeerId: socket.id,
      sdp,
      userName: socket.userName
    });
  });

  // 3. WebRTC SDP Answer Relay
  socket.on('answer', ({ targetPeerId, sdp }) => {
    io.to(targetPeerId).emit('answer', {
      responderPeerId: socket.id,
      sdp
    });
  });

  // 4. WebRTC ICE Candidate Relay
  socket.on('ice-candidate', ({ targetPeerId, candidate }) => {
    io.to(targetPeerId).emit('ice-candidate', {
      senderPeerId: socket.id,
      candidate
    });
  });

  // 5. Media State Updates (Mute/Video off sync)
  socket.on('toggle-media', ({ isAudioMuted, isVideoOff }) => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const participant = rooms.get(roomId).get(socket.id);
      if (participant) {
        participant.isAudioMuted = isAudioMuted;
        participant.isVideoOff = isVideoOff;
      }
      socket.to(roomId).emit('peer-media-toggle', {
        peerId: socket.id,
        isAudioMuted,
        isVideoOff
      });
    }
  });

  // 6. In-Call Chat Message
  socket.on('send-chat', ({ message }) => {
    const roomId = socket.roomId;
    if (roomId) {
      const chatPayload = {
        senderId: socket.id,
        senderName: socket.userName,
        message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      io.to(roomId).emit('new-chat-message', chatPayload);
    }
  });

  // 7. Screen Sharing Toggle Notification
  socket.on('screen-share-status', ({ isSharing }) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('peer-screen-share', {
        peerId: socket.id,
        isSharing
      });
    }
  });

  // 8. Raise Hand Toggle Notification
  socket.on('raise-hand', ({ isHandRaised }) => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const participant = rooms.get(roomId).get(socket.id);
      if (participant) {
        participant.isHandRaised = isHandRaised;
      }
      socket.to(roomId).emit('peer-raise-hand', {
        peerId: socket.id,
        userName: socket.userName,
        isHandRaised
      });
    }
  });

  // 8. Disconnect Cleanup
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    console.log(`[Signaling] Peer disconnected: ${socket.id} (Room: ${roomId || 'None'})`);

    if (roomId && rooms.has(roomId)) {
      const roomParticipants = rooms.get(roomId);
      roomParticipants.delete(socket.id);

      // Notify others in the room
      socket.to(roomId).emit('user-left', {
        peerId: socket.id,
        userName: socket.userName
      });

      if (roomParticipants.size === 0) {
        rooms.delete(roomId);
        console.log(`[Signaling] Room "${roomId}" deleted (empty).`);
      }
    }
  });
});

// Fallback to client index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Google Meet Clone is running!`);
  console.log(` Web App:   http://localhost:${PORT}`);
  console.log(` API/Socket: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
