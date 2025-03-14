const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const userSockets = new Map(); // Track socket.id -> userId


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

const validateDrawData = (data) => {
  return data && 
         typeof data.x === 'number' &&
         typeof data.y === 'number' &&
         data.x >= 0 && data.x <= 640 &&
         data.y >= 0 && data.y <= 480 &&
         validateRoomId(data.roomId);
};

// Socket.IO handlers
io.on('connection', (socket) => {
  logger.info(`New connection: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, userId }) => {
    try {
      if (!validateRoomId(roomId)) throw new Error('Invalid room ID');
  
      // Store user-socket relationship
      userSockets.set(socket.id, userId);
  
      let room = rooms.get(roomId) || { users: new Set(), count: 0 };
      
      if (!room.users.has(userId)) {
        room.users.add(userId);
        room.count = room.users.size;
        rooms.set(roomId, room);
      }
  
      // Send current count to everyone
      io.to(roomId).emit('user-joined', {
        participants: room.count,
        username: `User ${userId.slice(-4)}`
      });
      socket.emit('force-update-count', room.count);
      socket.join(roomId);
    } catch (error) {
      logger.error(`Join error: ${error.message}`);
    }
  });

// Modify the disconnect handler
// Add these in the disconnect handler


socket.on('disconnect', () => {

  // Add these in the disconnect handle

  const userId = userSockets.get(socket.id);
  userSockets.delete(socket.id);

  Array.from(socket.rooms).forEach(roomId => {
    if (roomId !== socket.id) {
      const room = rooms.get(roomId);
      if (room && room.users.has(userId)) {
        // Remove user and update count FIRST
        room.users.delete(userId);
        const newCount = room.users.size;
        room.count = newCount;
                // Add these in the disconnect handler
          console.log('User disconnected:', userId);
          console.log('Updated room state:', rooms.get(roomId));
          // Then emit to ALL clients in the room
        io.to(roomId).emit('user-left', {
          participants: newCount,
          username: `User ${userId?.slice(-4) || 'Unknown'}`
        });

        if (newCount <= 0) rooms.delete(roomId);
      }
    }
  });
});

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
      const base64Data = data.image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Use reliable model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.5
        },
        systemInstruction: {
          parts: [{ 
            text: "You are a math expert. Analyze drawn equations and provide step-by-step solutions in simple language." 
          }]
        }
      });

      logger.info(`Processing AI request for room: ${data.roomId}`);
      
      const result = await model.generateContent(
        [
          "Analyze this drawn math problem and provide step-by-step solution:",
          {
            inlineData: {
              data: base64Data,
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
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/\\boxed{(.*?)}/g, '$1')
          .replace(/\$/g, '')
      });

    } catch (error) {
      clearTimeout(timeoutId);
      logger.error(`AI processing failed: ${error.message}`);
      
      let errorMessage = 'Failed to process request';
      if (error.message.includes('quota')) {
        errorMessage = 'API quota exceeded';
      } else if (error.message.includes('invalid')) {
        errorMessage = 'Invalid image format';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Request timed out';
      }

      socket.emit('aiError', {
        roomId: data.roomId,
        message: errorMessage
      });
    }
  });

  socket.on('draw', (data) => {
    if (!validateDrawData(data)) {
      logger.warn(`Invalid draw data from ${socket.id}`);
      return;
    }
    try {
      io.to(data.roomId).emit('draw', {
        ...data,
        isErasing: data.isErasing || false
      });
    } catch (error) {
      logger.error(`Draw event error: ${error.message}`);
    }
  });

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

  socket.on('clearCanvas', (data) => {
    if (!validateRoomId(data.roomId)) return;
    try {
      io.to(data.roomId).emit('clearCanvas', data);
    } catch (error) {
      logger.error(`Clear canvas error: ${error.message}`);
    }
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