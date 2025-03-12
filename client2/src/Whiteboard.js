// Whiteboard.js
import React, { useRef, useState, useEffect, useCallback } from 'react';

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const animationFrameRef = useRef(null);

  // New state for tool mode: "draw" or "erase"
  const [tool, setTool] = useState('draw');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  // Function to calculate canvas coordinates with scaling
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

  // Optimized function to draw a line
  const drawLine = useCallback((prevX, prevY, x, y, strokeColor, strokeWidth) => {
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

  // Socket event handler for drawing data
  const handleDraw = useCallback((data) => {
    // Ignore self-generated events (for mouse drawing) unless they come from hand gestures
    if (!data.handGesture && data.senderId === localId) return;
    drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth);
  }, [localId, drawLine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set fixed internal resolution
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    // Set stroke style based on tool mode
    context.strokeStyle = tool === 'erase' ? '#ffffff' : color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Socket event listeners
    socket.on('draw', handleDraw);
    socket.on('clearCanvas', () => context.clearRect(0, 0, canvas.width, canvas.height));

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clearCanvas');
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [socket, localId, color, lineWidth, tool, handleDraw]);

  // Update stroke style when color, lineWidth, or tool mode changes
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = tool === 'erase' ? '#ffffff' : color;
      contextRef.current.lineWidth = lineWidth;
    }
  }, [color, lineWidth, tool]);

  // Mouse-based drawing handlers
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

      // Emit drawing event; if eraser is active, use white color
      socket.emit('draw', {
        roomId,
        senderId: localId,
        prevX: prevCoords.current.x,
        prevY: prevCoords.current.y,
        x,
        y,
        color: tool === 'erase' ? "#ffffff" : color,
        lineWidth,
        handGesture: false
      });

      prevCoords.current = { x, y };
    });
  };

  const endDrawing = () => {
    isDrawing.current = false;
    contextRef.current.closePath();
    prevCoords.current = null;
  };

  // Clear the canvas locally
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Handle clear button: clear locally and emit event
  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId, senderId: localId });
  };

  // Toggle the tool mode between "draw" and "erase"
  const toggleEraser = () => {
    setTool((prev) => (prev === 'draw' ? 'erase' : 'draw'));
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <label>Color: </label>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)}
          aria-label="Select drawing color"
          disabled={tool === 'erase'}  // Disable color picker in eraser mode
        />
        <label>Line Width: </label>
        <input
          type="range"
          min="1"
          max="10"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          aria-label="Adjust line width"
        />
        {/* Eraser button */}
        <button 
          onClick={toggleEraser}
          style={tool === 'erase' ? styles.activeEraserButton : styles.eraserButton}
          aria-label="Toggle eraser mode"
        >
          {tool === 'erase' ? 'Eraser On' : 'Eraser Off'}
        </button>
        <button 
          onClick={handleClear} 
          style={styles.clearButton}
          aria-label="Clear whiteboard"
        >
          Clear
        </button>
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
    </div>
  );
}

const styles = {
  whiteboardContainer: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #ccc',
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
    width: '100%',
    height: 'auto',
    aspectRatio: '4/3'
  },
  eraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#ffc107',
    color: '#000',
    border: 'none',
    borderRadius: '4px'
  },
  activeEraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#e0a800',
    color: '#fff',
    border: 'none',
    borderRadius: '4px'
  },
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px'
  }
};

export default React.memo(Whiteboard);
