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

// Initialize Gemini AI with error handling
let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  logger.info('Gemini AI initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Gemini AI:', error.message);
  process.exit(1);
}

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') :
    ['http://localhost:3000'],
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
    origin: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['http://localhost:3000'],
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

  // AI Processing Handler (NEW AND IMPROVED)
  socket.on('processWithAI', async (data) => {
    if (!data?.image || !validateRoomId(data.roomId)) {
      logger.error('Invalid AI request format');
      return socket.emit('aiError', {
        roomId: data.roomId,
        message: 'Invalid request format'
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.error('AI request timed out');
    }, 15000);

    try {
      // Validate image data
      const imageParts = data.image.split(',');
      if (imageParts.length !== 2 || !imageParts[1]) {
        throw new Error('Invalid image data format');
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-pro-vision",
        generationConfig: { 
          maxOutputTokens: 1000,
          temperature: 0.9
        }
      });

      logger.info(`Processing AI request for room: ${data.roomId}`);
      
      const result = await model.generateContent(
        [
          data.prompt,
          {
            inlineData: {
              data: imageParts[1],
              mimeType: "image/png"
            }
          }
        ],
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);
      const response = await result.response;
      const text = response.text();

      logger.info(`AI response generated for room: ${data.roomId}`);
      io.to(data.roomId).emit('aiResponse', {
        roomId: data.roomId,
        response: text.replace(/\n/g, '<br>')
                       .replace(/\*\*/g, '<strong>')
                       .replace(/\*/g, '<em>')
      });

    } catch (error) {
      clearTimeout(timeoutId);
      logger.error(`AI processing failed: ${error.message}`);
      const errorMessage = error.name === 'AbortError' ? 
        'Request timed out' : 
        error.message || 'Failed to process request';
      
      socket.emit('aiError', {
        roomId: data.roomId,
        message: errorMessage
      });
    }
  });

  // Existing handlers (draw, chatMessage, clearCanvas) remain same
  // ... [Keep existing drawing and chat handlers unchanged] ...

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
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received: closing server');
  server.close(() => {
    logger.info('Server terminated');
    process.exit(0);
  });
});