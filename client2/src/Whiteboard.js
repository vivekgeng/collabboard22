// Whiteboard.js
import React, { useRef, useState, useEffect, useCallback } from 'react';

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const animationFrameRef = useRef(null);
  
  // State variables
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [isEraser, setIsEraser] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Get canvas coordinates
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

  // Draw line helper function
  const drawLine = useCallback((prevX, prevY, x, y, strokeColor, strokeWidth) => {
    if (prevX == null || prevY == null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      const context = contextRef.current;
      if (!context) return;

      const path = new Path2D();
      path.moveTo(prevX, prevY);
      path.lineTo(x, y);
      
      context.save();
      context.strokeStyle = strokeColor;
      context.lineWidth = strokeWidth;
      context.stroke(path);
      context.restore();
    });
  }, []);

  // Handle incoming drawing data
  const handleDraw = useCallback((data) => {
    if (!data.handGesture && data.senderId === localId) return;
    const context = contextRef.current;
    if (!context) return;

    drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth);
  }, [localId, drawLine]);

  // Start drawing
  const startDrawing = (e) => {
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    isDrawing.current = true;
    prevCoords.current = { x, y };
    
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    contextRef.current.strokeStyle = isEraser ? '#FFFFFF' : color;
    contextRef.current.lineWidth = isEraser ? eraserSize : lineWidth;
  };

  // Continue drawing
  const draw = (e) => {
    if (!isDrawing.current || !prevCoords.current) return;
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

    animationFrameRef.current = requestAnimationFrame(() => {
      contextRef.current.lineTo(x, y);
      contextRef.current.stroke();

      socket.emit('draw', {
        roomId,
        senderId: localId,
        prevX: prevCoords.current.x,
        prevY: prevCoords.current.y,
        x,
        y,
        color: isEraser ? '#FFFFFF' : color,
        lineWidth: isEraser ? eraserSize : lineWidth,
        handGesture: false
      });

      prevCoords.current = { x, y };
    });
  };

  // Stop drawing
  const endDrawing = () => {
    isDrawing.current = false;
    contextRef.current.closePath();
    prevCoords.current = null;
  };

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId, senderId: localId });
  };

  // Setup effect
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    socket.on('draw', handleDraw);
    socket.on('clearCanvas', () => context.clearRect(0, 0, canvas.width, canvas.height));

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clearCanvas');
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [socket, localId, color, lineWidth, handleDraw]);

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        {/* Eraser/Brush Toggle */}
        <button 
          onClick={() => setIsEraser(!isEraser)}
          style={isEraser ? styles.activeTool : styles.toolButton}
        >
          {isEraser ? '✏️ Switch to Brush' : '🧹 Eraser'}
        </button>

        {/* Color Picker (only when not erasing) */}
        {!isEraser && (
          <>
            <label>Color: </label>
            <input 
              type="color" 
              value={color} 
              onChange={(e) => setColor(e.target.value)}
              aria-label="Select drawing color"
            />
          </>
        )}

        {/* Size Controls */}
        <label>{isEraser ? 'Eraser Size: ' : 'Brush Size: '}</label>
        <input
          type="range"
          min="1"
          max={isEraser ? 50 : 10}
          value={isEraser ? eraserSize : lineWidth}
          onChange={(e) => 
            isEraser 
              ? setEraserSize(Number(e.target.value)) 
              : setLineWidth(Number(e.target.value))
          }
          aria-label="Adjust tool size"
        />

        {/* Clear Button */}
        <button 
          onClick={handleClear} 
          style={styles.clearButton}
          aria-label="Clear whiteboard"
        >
          Clear
        </button>
      </div>
      
      {/* Drawing Canvas */}
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

      {/* AI Answers Section */}
      <div style={styles.aiContainer}>
        <div style={styles.aiHeader}>AI Answers</div>
        <div style={styles.aiContent}>
          {isLoadingAI ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Analyzing problem...</p>
            </div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: aiResponse || 'Draw a math problem and pinch to analyze' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// Styles
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
  toolButton: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  activeTool: {
    padding: '8px 16px',
    backgroundColor: '#4F81E1',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
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
  }
};

export default React.memo(Whiteboard);