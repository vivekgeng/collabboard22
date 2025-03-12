// Whiteboard.js
import React, { useRef, useState, useEffect, useCallback } from 'react';

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const animationFrameRef = useRef(null);

  // Tool mode state: "draw" or "erase"
  const [tool, setTool] = useState('draw');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  // Get proper canvas coordinates (accounting for scaling)
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

  // Draw a line on the canvas; if eraser is true, use destination-out mode to erase
  const drawLine = useCallback((prevX, prevY, x, y, strokeColor, strokeWidth, eraser = false) => {
    animationFrameRef.current = requestAnimationFrame(() => {
      const context = contextRef.current;
      if (!context) return;
      context.save();
      // If eraser, set composite mode to remove pixels
      if (eraser) {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(0,0,0,1)'; // color doesn't matter here
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
    // Ignore self-generated events unless they come from hand gestures
    if (!data.eraser && data.senderId === localId) return;
    drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth, data.eraser);
  }, [localId, drawLine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set internal resolution; display can be controlled via CSS
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    // We'll use the drawLine function to set composite mode as needed
    contextRef.current = context;

    // Setup socket listeners
    socket.on('draw', handleDraw);
    socket.on('clearCanvas', () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    });

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clearCanvas');
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [socket, localId, handleDraw]);

  // Update stroke style when not using globalCompositeOperation directly;
  // Our drawLine function sets composite mode on each draw.
  // (We could update contextRef here if needed.)

  // Mouse event handlers for drawing/erasing
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
      // Use our drawLine function with eraser flag if tool === 'erase'
      drawLine(prevCoords.current.x, prevCoords.current.y, x, y, color, lineWidth, tool === 'erase');
      // Emit the draw event to other clients
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

  // Clear the entire canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Handle clear button: clear locally and notify others
  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId, senderId: localId });
  };

  // Toggle between drawing and eraser modes
  const toggleEraser = () => {
    setTool((prev) => (prev === 'draw' ? 'erase' : 'draw'));
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <label>{tool === 'draw' ? 'Color:' : 'Eraser Size:'}</label>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)}
          aria-label="Select drawing color"
          disabled={tool === 'erase'} // Disable color picker in eraser mode
        />
        <label>Line Width:</label>
        <input
          type="range"
          min="1"
          max="20"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          aria-label={tool === 'draw' ? "Adjust line width" : "Adjust eraser size"}
        />
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
