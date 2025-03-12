// Whiteboard.js
import React, { useRef, useState, useEffect } from 'react';

function Whiteboard({ socket, roomId, localId }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const prevCoords = useRef(null);
  const isDrawing = useRef(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Set canvas dimensions
    canvas.width = 640;
    canvas.height = 480;
    canvas.style.width = '640px';
    canvas.style.height = '480px';
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    contextRef.current = context;

    // Listen for remote draw events
    socket.on('draw', (data) => {
      // For normal mouse-drawn events, ignore if it comes from this client
      // Always process handGesture events
      if (!data.handGesture && data.senderId && data.senderId === localId) return;
      drawLine(data.prevX, data.prevY, data.x, data.y, data.color, data.lineWidth);
    });

    socket.on('clearCanvas', () => {
      clearCanvas();
    });

    return () => {
      socket.off('draw');
      socket.off('clearCanvas');
    };
  }, [socket, localId]);

  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = lineWidth;
    }
  }, [color, lineWidth]);

  const startDrawing = (e) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    isDrawing.current = true;
    prevCoords.current = { x, y };
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current || !prevCoords.current) return;
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();

    // Emit mouse-drawn event (handGesture flag is false)
    socket.emit('draw', {
      roomId,
      senderId: localId,
      prevX: prevCoords.current.x,
      prevY: prevCoords.current.y,
      x,
      y,
      color,
      lineWidth,
      handGesture: false
    });

    prevCoords.current = { x, y };
  };

  const endDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    contextRef.current.closePath();
    prevCoords.current = null;
  };

  const handleMouseLeave = () => {
    endDrawing();
  };

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

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleClear = () => {
    clearCanvas();
    socket.emit('clearCanvas', { roomId, senderId: localId });
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.tools}>
        <label>Color: </label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label>Line Width: </label>
        <input type="range" min="1" max="10" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
        <button onClick={handleClear} style={styles.clearButton}>Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={handleMouseLeave}
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
