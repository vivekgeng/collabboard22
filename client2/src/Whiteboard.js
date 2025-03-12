// Whiteboard.js
import React, { useRef, useState, useEffect, useCallback } from 'react';

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const animationFrameRef = useRef(null);

  // Tool state: "draw" or "erase"
  const [tool, setTool] = useState('draw');
  // Drawing settings
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  // Eraser settings (size)
  const [eraserSize, setEraserSize] = useState(20);
  // For eraser cursor indicator position
  const [eraserPos, setEraserPos] = useState({ x: null, y: null });

  // Calculate canvas coordinates (account for scaling)
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

  // Draw a line with optional eraser effect
  const drawLine = useCallback((prevX, prevY, x, y, strokeColor, strokeWidth, eraser = false) => {
    animationFrameRef.current = requestAnimationFrame(() => {
      const context = contextRef.current;
      if (!context) return;
      context.save();
      if (eraser) {
        context.globalCompositeOperation = 'destination-out';
        // Stroke color doesn't matter when erasing
        context.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = strokeColor;
      }
      context.lineWidth = strokeWidth;
      const path = new Path2D();
      path.moveTo(prevX, prevY);
      path.lineTo(x, y);
      context.stroke(path);
      context.restore();
    });
  }, []);

  // Handle incoming draw events from the socket
  const handleDraw = useCallback((data) => {
    // Ignore self-generated mouse-drawn events (handGesture events include eraser flag already)
    if (!data.eraser && data.senderId === localId) return;
    drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth, data.eraser);
  }, [localId, drawLine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set fixed internal resolution; display controlled by CSS
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    // (The drawLine function will set the correct composite mode)
    contextRef.current = context;

    socket.on('draw', handleDraw);
    socket.on('clearCanvas', () => context.clearRect(0, 0, canvas.width, canvas.height));

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clearCanvas');
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [socket, localId, handleDraw]);

  // Mouse event handlers
  const startDrawing = (e) => {
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    isDrawing.current = true;
    prevCoords.current = { x, y };
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
  };

  const draw = (e) => {
    // Always update eraser cursor position if in eraser mode
    if (tool === 'erase') {
      const pos = getCanvasCoordinates(e.clientX, e.clientY);
      setEraserPos(pos);
    }
    if (!isDrawing.current || !prevCoords.current) return;
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    animationFrameRef.current = requestAnimationFrame(() => {
      drawLine(prevCoords.current.x, prevCoords.current.y, x, y, color, lineWidth, tool === 'erase');
      socket.emit('draw', {
        roomId,
        senderId: localId,
        prevX: prevCoords.current.x,
        prevY: prevCoords.current.y,
        x,
        y,
        color,
        lineWidth,
        eraser: tool === 'erase'
      });
      prevCoords.current = { x, y };
    });
  };

  const endDrawing = () => {
    isDrawing.current = false;
    contextRef.current.closePath();
    prevCoords.current = null;
  };

  // Clear the canvas completely
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId, senderId: localId });
  };

  // Toggle eraser mode (but leave drawing mode as default otherwise)
  const toggleEraser = () => {
    setTool(prev => (prev === 'draw' ? 'erase' : 'draw'));
  };

  // For updating eraser cursor even when not drawing
  const handleMouseMove = (e) => {
    if (tool === 'erase') {
      const pos = getCanvasCoordinates(e.clientX, e.clientY);
      setEraserPos(pos);
    }
    draw(e);
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <div style={styles.drawTools}>
          <label>Color: </label>
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)}
            aria-label="Select drawing color"
          />
          <label>Line Width: </label>
          <input
            type="range"
            min="1"
            max="10"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            aria-label="Adjust drawing line width"
          />
        </div>
        <div style={styles.eraserTools}>
          <button 
            onClick={toggleEraser}
            style={tool === 'erase' ? styles.activeEraserButton : styles.eraserButton}
            aria-label="Toggle eraser mode"
          >
            {tool === 'erase' ? 'Eraser On' : 'Eraser Off'}
          </button>
          <label>Eraser Size: </label>
          <input
            type="range"
            min="5"
            max="50"
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
            aria-label="Adjust eraser size"
          />
        </div>
        <button 
          onClick={handleClear} 
          style={styles.clearButton}
          aria-label="Clear whiteboard"
        >
          Clear
        </button>
      </div>
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          aria-label="Collaborative whiteboard"
          role="img"
        />
        {tool === 'erase' && eraserPos.x !== null && (
          <div 
            style={{
              ...styles.eraserCursor,
              width: `${eraserSize}px`,
              height: `${eraserSize}px`,
              left: `${eraserPos.x - eraserSize / 2}px`,
              top: `${eraserPos.y - eraserSize / 2}px`
            }}
          />
        )}
      </div>
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
    gap: '20px',
    flexWrap: 'wrap'
  },
  drawTools: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  eraserTools: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  canvasWrapper: {
    position: 'relative',
    flex: 1
  },
  canvas: {
    background: '#ffffff',
    cursor: 'crosshair',
    touchAction: 'none',
    width: '100%',
    height: 'auto',
    aspectRatio: '4/3'
  },
  eraserCursor: {
    position: 'absolute',
    border: '2px solid #000',
    borderRadius: '50%',
    pointerEvents: 'none'
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
