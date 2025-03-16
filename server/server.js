const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rooms = new Map(); // Stores room data including whiteboard pages and participants


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

let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  logger.info('Gemini AI initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Gemini AI:', error.message);
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') :
    ['http://localhost:3000'],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const server = http.createServer(app);

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


const validateRoomId = (roomId) => {
  return typeof roomId === 'string' && roomId.length > 0;
};


const validateDrawData = (data) => {
  return data && 
         typeof data.x === 'number' &&
         typeof data.y === 'number' &&
         typeof data.page === 'number' &&
         data.x >= 0 && data.x <= 640 &&
         data.y >= 0 && data.y <= 480 &&
         validateRoomId(data.roomId);
};

const validatePageIndex = (room, pageIndex) => {
  return pageIndex >= 0 && pageIndex < room.pages.length;
};

io.on('connection', (socket) => {
  logger.info(`New connection: ${socket.id}`);

  socket.on('endStroke', (data) => {
    if (!validateRoomId(data.roomId)) {
      logger.warn(`Invalid room ID format in endStroke event from ${socket.id}`);
      return;
    }
  
    try {
      io.to(data.roomId).emit('endStroke', {
        strokeId: data.strokeId,
        page: data.page
      });
    } catch (error) {
      logger.error(`EndStroke event error: ${error.message}`);
    }
  });

  socket.on('joinRoom', (roomId) => {
    try {
      if (!validateRoomId(roomId)) {
        throw new Error('Invalid room ID format');
      }

      socket.join(roomId);
      const room = rooms.get(roomId) || { 
        participants: 0, 
        pages: [{ id: Date.now(), imageData: '' }] 
      };
      room.participants++;
      rooms.set(roomId, room);
      
      logger.info(`Socket ${socket.id} joined room: ${roomId}`);
      socket.emit('roomStatus', { 
        participants: room.participants,
        roomId 
      });

    } catch (error) {
      logger.error(`Join room error: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('addPage', (data) => {
    if (validateRoomId(data.roomId)) {
      const room = rooms.get(data.roomId) || { pages: [] };
      
      // Update existing page BEFORE adding new one
      const pageIndex = room.pages.findIndex(p => p.id === data.pageId);
      if (pageIndex > -1) {
        room.pages[pageIndex].imageData = data.imageData;
      }
  
      // Add new blank page AFTER updating current
      const newPage = { id: Date.now(), imageData: '' };
      room.pages = [...room.pages, newPage]; // Preserve existing pages
      rooms.set(data.roomId, room);
  
      // Broadcast updated pages
      io.to(data.roomId).emit('fullPageUpdate', room.pages);
    }
  });
  
  // Add this new handler

  socket.on('removePage', (data) => {
    if (validateRoomId(data.roomId)) {
      const room = rooms.get(data.roomId);
      if (room) {
        room.pages = room.pages.filter(p => p.id !== data.pageId);
        rooms.set(data.roomId, room);
        io.to(data.roomId).emit('fullPageUpdate', room.pages);
      }
    }
  });

  socket.on('requestInitialState', (roomId) => {
    if (validateRoomId(roomId)) {
      const room = rooms.get(roomId);
      socket.emit('initialState', room?.pages || []);
    }
  });

  socket.on('updatePageState', (data) => {
    if (validateRoomId(data.roomId)) {
      const room = rooms.get(data.roomId);
      const page = room?.pages?.find(p => p.id === data.pageId);
      if (page) {
        page.imageData = data.imageData;
        rooms.set(data.roomId, room);
      }
    }
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
      const imageParts = data.image.split(',');
      if (imageParts.length !== 2 || !imageParts[1]) {
        throw new Error('Invalid image data format');
      }

      const maxSize = 4 * 1024 * 1024;
      if (Buffer.byteLength(imageParts[1], 'base64') > maxSize) {
        throw new Error('Image too large');
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.4
        },
        systemInstruction: {
          parts: [{
            text: "You are a patient math tutor. Analyze handwritten problems carefully. " +
                  "Look for numbers, symbols, and equations. If unsure, make reasonable " +
                  "assumptions and state them. Present solutions step-by-step with clear explanations."
          }]
        }
      });

      logger.info(`Processing AI request for room: ${data.roomId}`);
      
      const result = await model.generateContent(
        [
          data.prompt || "Analyze this drawn math problem and provide step-by-step solution:",
          {
            inlineData: {
              data: imageParts[1],
              mimeType: "image/jpeg"
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
      } else if (error.message.includes('invalid') || error.message.includes('format')) {
        errorMessage = 'Invalid image format';
      } else if (error.message.includes('large')) {
        errorMessage = 'Image size exceeds 4MB limit';
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
      const room = rooms.get(data.roomId);
      if (room && validatePageIndex(room, data.page)) {
        // Broadcast to all clients regardless of current page
        io.to(data.roomId).emit('draw', {
          ...data,
          compositeOperation: data.isErasing ? 'destination-out' : 'source-over'
        });
      }
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
        const room = rooms.get(roomId);
        room.participants--;
        if (room.participants <= 0) {
          rooms.delete(roomId);
        } else {
          rooms.set(roomId, room);
        }
      }
    });
  });
});

app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.stack}`);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received: closing server');
  server.close(() => {
    logger.info('Server terminated');
    process.exit(0);
  });
});