import React, { useRef, useState, useEffect } from 'react';

function Whiteboard({ socket, roomId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null); // For tracking previous coordinates
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set canvas drawing buffer dimensions
    canvas.width = 640;
    canvas.height = 480;
    // Also set CSS dimensions to match exactly
    canvas.style.width = '640px';
    canvas.style.height = '480px';

    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Listen for incoming draw events from other clients
    socket.on('draw', (data) => {
      drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth);
    });

    // Listen for clearCanvas events
    socket.on('clearCanvas', () => {
      clearCanvas();
    });

    return () => {
      socket.off('draw');
      socket.off('clearCanvas');
    };
  }, [socket]);

  // Update local drawing settings when color or lineWidth changes
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = lineWidth;
    }
  }, [color, lineWidth]);

  // Start drawing: initialize previous coordinates using offsetX/Y
  const startDrawing = (e) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    prevCoords.current = { x, y };
  };

  // Draw on the canvas and emit the drawing event using offsetX/Y
  const draw = (e) => {
    if (!prevCoords.current) return;
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    const context = contextRef.current;
    context.lineTo(x, y);
    context.stroke();

    // Emit drawing data to other clients in the room
    socket.emit('draw', {
      roomId,
      prevX: prevCoords.current.x,
      prevY: prevCoords.current.y,
      x,
      y,
      color,
      lineWidth
    });

    // Update previous coordinates
    prevCoords.current = { x, y };
  };

  // End drawing by clearing previous coordinates and closing the path
  const endDrawing = () => {
    if (contextRef.current) {
      contextRef.current.closePath();
    }
    prevCoords.current = null;
  };

  // Function to draw lines from incoming data
  const drawLine = (prevX, prevY, x, y, strokeColor, strokeWidth) => {
    const context = contextRef.current;
    if (!context) return;
    context.save();
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.beginPath();
    context.moveTo(prevX, prevY);
    context.lineTo(x, y);
    context.stroke();
    context.closePath();
    context.restore();
  };

  // Clear the canvas locally
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId });
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <label>Color: </label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <label>Line Width: </label>
        <input
          type="range"
          min="1"
          max="10"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
        />
        <button onClick={handleClear} style={styles.clearButton}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
      />
    </div>
  );
}

const styles = {
  whiteboardContainer: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #ccc'
  },
  tools: {
    padding: '10px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  canvas: {
    background: '#ffffff',
    cursor: 'crosshair'
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

export default Whiteboard;
