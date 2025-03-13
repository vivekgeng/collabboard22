// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ]
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://collabboard22.vercel.app/', 'http://localhost:3000']
    : 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Create HTTP server
const server = http.createServer(app);

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://collabboard22.vercel.app/', 'http://localhost:3000']
      : 'http://localhost:3000',
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket'],
  pingInterval: 10000,
  pingTimeout: 5000
});

// Room state management
const rooms = new Map();

const validateRoomId = (roomId) => {
  return typeof roomId === 'string' && roomId.length > 0;
};

// Socket.IO handlers
io.on('connection', (socket) => {
  logger.info(`New connection: ${socket.id}`);

  // Room joining handler
  socket.on('joinRoom', (roomId) => {
    try {
      if (!validateRoomId(roomId)) {
        throw new Error('Invalid room ID format');
      }

      socket.join(roomId);
      rooms.set(roomId, (rooms.get(roomId) || 0) + 1);
      
      logger.info(`Socket ${socket.id} joined room: ${roomId}`);
      socket.emit('roomStatus', { 
        participants: rooms.get(roomId),
        roomId 
      });

    } catch (error) {
      logger.error(`Join room error: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  });

  // Drawing event handler
  socket.on('draw', (data) => {
    if (!data || !validateRoomId(data.roomId)) return;
    
    try {
      io.to(data.roomId).emit('draw', data);
    } catch (error) {
      logger.error(`Draw event error: ${error.message}`);
    }
  });

  // AI Processing Handler
  socket.on('processWithAI', async (data) => {
    try {
      if (!validateRoomId(data.roomId)) return;

      const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
      const imageParts = [{
        inlineData: {
          data: data.image.split(',')[1], // Remove data URL prefix
          mimeType: "image/png"
        }
      }];

      const result = await model.generateContent([data.prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();

      io.to(data.roomId).emit('aiResponse', {
        roomId: data.roomId,
        response: text.replace(/\n/g, '<br>')
      });
    } catch (error) {
      logger.error(`AI processing error: ${error.message}`);
      io.to(data.roomId).emit('aiError', {
        roomId: data.roomId,
        message: 'Failed to process request'
      });
    }
  });

  // Chat message handler
  socket.on('chatMessage', (msgData) => {
    if (!msgData?.message || !validateRoomId(msgData.roomId)) return;

    try {
      const sanitizedMessage = msgData.message.substring(0, 200);
      const finalData = {
        ...msgData,
        message: sanitizedMessage,
        timestamp: Date.now()
      };
      
      io.to(msgData.roomId).emit('chatMessage', finalData);
    } catch (error) {
      logger.error(`Chat message error: ${error.message}`);
    }
  });

  // Clear canvas handler
  socket.on('clearCanvas', (data) => {
    if (!validateRoomId(data.roomId)) return;

    try {
      io.to(data.roomId).emit('clearCanvas', data);
    } catch (error) {
      logger.error(`Clear canvas error: ${error.message}`);
    }
  });

  // Disconnection handler
  socket.on('disconnect', (reason) => {
    logger.info(`Disconnected: ${socket.id} (${reason})`);
    
    Array.from(socket.rooms).forEach(roomId => {
      if (roomId !== socket.id && rooms.has(roomId)) {
        const count = rooms.get(roomId) - 1;
        rooms.set(roomId, count);
        if (count <= 0) rooms.delete(roomId);
      }
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.stack}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received: closing server');
  server.close(() => {
    logger.info('Server terminated');
    process.exit(0);
  });
});