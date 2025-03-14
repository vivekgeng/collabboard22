// Whiteboard.js
import React, { useRef, useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify'; // Install with: npm install dompurify

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const animationFrameRef = useRef(null);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);

  const getCanvasCoordinates = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }, []);

  const drawLine = useCallback((prevX, prevY, x, y, strokeColor, strokeWidth, isErasing) => {
    if (prevX == null || prevY == null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      const context = contextRef.current;
      if (!context) return;

      const path = new Path2D();
      path.moveTo(prevX, prevY);
      path.lineTo(x, y);
      
      context.save();
      context.strokeStyle = isErasing ? '#FFFFFF' : strokeColor;
      context.lineWidth = isErasing ? eraserSize : strokeWidth;
      context.stroke(path);
      context.restore();
    });
  }, [eraserSize]);

  const handleDraw = useCallback((data) => {
    if (!data.handGesture && data.senderId === localId) return;
    if (data.x == null || data.y == null) return;
    
    const context = contextRef.current;
    if (!context) return;

    if (data.prevX == null || data.prevY == null) {
      context.beginPath();
      context.moveTo(data.x, data.y);
      return;
    }
    
    drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth, data.isErasing);
  }, [localId, drawLine]);

  useEffect(() => {
    const handleAIResponse = (data) => {
      if (data.roomId === roomId) {
        setAiResponse(data.response);
        setIsLoadingAI(false);
      }
    };

    const handleAIError = () => {
      setAiResponse('Error processing request. Please try again.');
      setIsLoadingAI(false);
    };

    socket?.on('aiResponse', handleAIResponse);
    socket?.on('aiError', handleAIError);

    return () => {
      socket?.off('aiResponse', handleAIResponse);
      socket?.off('aiError', handleAIError);
    };
  }, [socket, roomId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    socket?.on('draw', handleDraw);
    socket?.on('clearCanvas', () => context.clearRect(0, 0, canvas.width, canvas.height));

    return () => {
      socket?.off('draw', handleDraw);
      socket?.off('clearCanvas');
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [socket, localId, color, lineWidth, handleDraw]);

  const startDrawing = (e) => {
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    isDrawing.current = true;
    prevCoords.current = { x, y };
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current || !prevCoords.current) return;
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

    animationFrameRef.current = requestAnimationFrame(() => {
      contextRef.current.lineTo(x, y);
      contextRef.current.stroke();

      socket?.emit('draw', {
        roomId,
        senderId: localId,
        prevX: prevCoords.current.x,
        prevY: prevCoords.current.y,
        x,
        y,
        color: isErasing ? '#FFFFFF' : color,
        lineWidth: isErasing ? eraserSize : lineWidth,
        handGesture: false,
        isErasing
      });

      prevCoords.current = { x, y };
    });
  };

  const endDrawing = () => {
    isDrawing.current = false;
    contextRef.current.closePath();
    prevCoords.current = null;
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleClear = () => {
    clearCanvas();
    socket?.emit('clearCanvas', { roomId, senderId: localId });
  };

  const handleEraserToggle = () => {
    setIsErasing(!isErasing);
    if (!isErasing) {
      contextRef.current.strokeStyle = '#FFFFFF';
      contextRef.current.lineWidth = eraserSize;
    } else {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = lineWidth;
    }
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <button 
          onClick={handleEraserToggle}
          style={isErasing ? styles.activeEraserButton : styles.eraserButton}
          aria-label={isErasing ? 'Disable eraser' : 'Enable eraser'}
        >
          {isErasing ? '✏️ Disable Eraser' : '🧹 Eraser'}
        </button>
        
        {isErasing && (
          <input
            type="range"
            min="10"
            max="50"
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
            aria-label="Adjust eraser size"
          />
        )}
        
        <button 
          onClick={handleClear} 
          style={styles.clearButton}
          aria-label="Clear whiteboard"
        >
          Clear
        </button>
        
        <label>Color: </label>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)}
          disabled={isErasing}
          aria-label="Select drawing color"
        />
        <label>Line Width: </label>
        <input
          type="range"
          min="1"
          max="10"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          disabled={isErasing}
          aria-label="Adjust line width"
        />
      </div>
      
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        aria-label="Collaborative whiteboard"
        role="img"
      />

      <div style={styles.aiContainer}>
        <div style={styles.aiHeader}>AI Answers</div>
        <div style={styles.aiContent}>
          {isLoadingAI ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Analyzing problem...</p>
            </div>
          ) : (
            <div 
              style={styles.responseText}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aiResponse) || 'Draw a math problem and pinch to analyze' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  whiteboardContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative'
  },
  tools: {
    padding: '10px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  canvas: {
    background: '#ffffff',
    cursor: 'crosshair',
    touchAction: 'none',
    flex: 1,
    minHeight: 0,
    aspectRatio: '4/3'
  },
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'opacity 0.2s',
    ':hover': {
      opacity: 0.8
    }
  },
  eraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#5a6268'
    }
  },
  activeEraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#4F81E1',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#3a6db7'
    }
  },
  aiContainer: {
    borderTop: '2px solid #4F81E1',
    backgroundColor: '#f8f9fa',
    height: '150px',
    minHeight: '150px',
    display: 'flex',
    flexDirection: 'column'
  },
  aiHeader: {
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '10px',
    fontWeight: 'bold',
    fontSize: '1.1rem'
  },
  aiContent: {
    flex: 1,
    padding: '15px',
    overflowY: 'auto',
    fontSize: '0.9rem',
    lineHeight: '1.5'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '0.5rem'
  },
  spinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  responseText: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
};

export default React.memo(Whiteboard);