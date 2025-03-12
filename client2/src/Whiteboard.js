import React, { useRef, useState, useEffect } from 'react';

function Whiteboard({ socket, roomId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null); // Use a separate ref to track previous coordinates
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set canvas dimensions
    canvas.width = 640;
    canvas.height = 480;
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

  // Update the local drawing settings when color or lineWidth changes
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = lineWidth;
    }
  }, [color, lineWidth]);

  // Start drawing: initialize the previous coordinates using a ref
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    prevCoords.current = { x, y };
  };

  // While drawing: draw on the canvas and emit the drawing event
  const draw = (e) => {
    if (!prevCoords.current) return; // Do nothing if drawing hasn't started
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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

    // Update previous coordinates for the next segment
    prevCoords.current = { x, y };
  };

  // End drawing: clear the previous coordinate ref and close the path
  const endDrawing = () => {
    if (contextRef.current) {
      contextRef.current.closePath();
    }
    prevCoords.current = null;
  };

  // Function to draw lines based on incoming socket data
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

  // Clear the canvas locally (and note that your server emits clear events as well)
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
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
    flex: 1,
    background: '#ffffff',
    cursor: 'crosshair'
  }
};

export default Whiteboard;
