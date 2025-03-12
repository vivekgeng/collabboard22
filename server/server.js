const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Create HTTP server
const server = http.createServer(app);

// Create a Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a particular room
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  // Listen for drawing data and broadcast to others in the same room
  socket.on('draw', (data) => {
    io.in(data.roomId).emit('draw', data);
  });  

  // Listen for chat messages and broadcast to others in the same room
  socket.on('chatMessage', (msgData) => {
    socket.to(msgData.roomId).emit('chatMessage', msgData);
  });
  
  // Listen for clearCanvas event and broadcast to the room
  socket.on('clearCanvas', (data) => {
    io.in(data.roomId).emit('clearCanvas', data);
  });
  

  // Disconnect event
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
