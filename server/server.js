const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

const rooms = new Map();

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

const validateAIImage = (imageData) => {
  try {
    const imageParts = imageData.split(',');
    if (imageParts.length !== 2) return false;
    
    const base64Length = imageParts[1].length;
    const sizeInBytes = 4 * Math.ceil(base64Length / 3) * 0.5624896334383812;
    if (sizeInBytes < 50000) return false;
    
    return true;
  } catch {
    return false;
  }
};

io.on('connection', (socket) => {
  logger.info(`New connection: ${socket.id}`);

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

  socket.on('addPage', (data) => {
    if (validateRoomId(data.roomId)) {
      const newPage = { id: Date.now() };
      io.to(data.roomId).emit('addPage', newPage);
    }
  });

  socket.on('removePage', (data) => {
    if (validateRoomId(data.roomId)) {
      io.to(data.roomId).emit('removePage', data.pageId);
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

    if (!validateAIImage(data.image)) {
      logger.error('Invalid image data');
      return socket.emit('aiError', {
        roomId: data.roomId,
        message: 'Please draw larger and clearer'
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.error('AI request timed out');
    }, 15000);

    try {
      const imageParts = data.image.split(',');
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
        compositeOperation: data.isErasing ? 'destination-out' : 'source-over'
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