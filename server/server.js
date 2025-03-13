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

  // ---------------------------
  // UPDATED ROOM JOINING HANDLER
  // ---------------------------
  socket.on('joinRoom', (roomId) => {
    try {
      if (!validateRoomId(roomId)) {
        throw new Error('Invalid room ID format');
      }

      const previousCount = rooms.get(roomId) || 0;
      const newCount = previousCount + 1;
      
      socket.join(roomId);
      rooms.set(roomId, newCount);

      // Notify existing users
      socket.broadcast.to(roomId).emit('userActivity', {
        type: 'join',
        count: newCount,
        message: `New user joined (${newCount} total)`
      });

      // Notify joining user
      socket.emit('roomStatus', {
        participants: newCount,
        roomId
      });

      logger.info(`Socket ${socket.id} joined room: ${roomId}`);

    } catch (error) {
      logger.error(`Join room error: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  });

  // ---------------------------
  // UPDATED DISCONNECT HANDLER
  // ---------------------------
  socket.on('disconnect', (reason) => {
    logger.info(`Disconnected: ${socket.id} (${reason})`);
    
    Array.from(socket.rooms).forEach(roomId => {
      if (roomId !== socket.id && rooms.has(roomId)) {
        const newCount = rooms.get(roomId) - 1;
        rooms.set(roomId, newCount);
        
        // Notify remaining users
        io.to(roomId).emit('userActivity', {
          type: 'leave',
          count: newCount,
          message: `User left (${newCount} remaining)`
        });

        if (newCount <= 0) rooms.delete(roomId);
      }
    });
  });

  // ---------------------------
  // UPDATED AI PROCESSING HANDLER (CRITICAL FIX HERE)
  // ---------------------------
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

      // CORRECTED MODEL NAME (gemini-1.5-flash)
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
        .replace(/\*\*/g, '')    // Remove bold markers
        .replace(/\*/g, '')      // Remove italics markers
        .replace(/\\boxed{(.*?)}/g, '$1') // Clean LaTeX boxes
        .replace(/\$/g, '')       // Remove dollar signs
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

  // ---------------------------
  // EXISTING HANDLERS (UNCHANGED)
  // ---------------------------
  socket.on('draw', (data) => {
    if (!data || !validateRoomId(data.roomId)) return;
    try {
      io.to(data.roomId).emit('draw', data);
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