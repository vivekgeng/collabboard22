import React, { useRef, useState, useEffect } from 'react';

function Whiteboard({ socket, roomId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null); // To store the previous drawing coordinates
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set canvas size to 640x480
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Listen for draw events from other clients
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

  // Update stroke style when color or lineWidth changes
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = lineWidth;
    }
  }, [color, lineWidth]);

  // Local drawing functions for mouse-based drawing
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const context = contextRef.current;
    context.beginPath();
    context.moveTo(x, y);
    // Save the initial coordinate
    prevCoords.current = { x, y };
  };

  const draw = (e) => {
    if (!prevCoords.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const context = contextRef.current;
    context.lineTo(x, y);
    context.stroke();

    // Emit the draw event so that others can see the line
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

  const endDrawing = () => {
    if (contextRef.current) {
      contextRef.current.closePath();
    }
    prevCoords.current = null;
  };

  // Function to draw incoming lines from remote events
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

  // Function to clear the canvas
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
