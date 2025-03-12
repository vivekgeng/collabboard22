// HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);           // Hidden video element for hand detection
  const drawingCanvasRef = useRef(null);     // Canvas for drawing based on hand gestures
  const prevCoords = useRef(null);           // Previous index finger coordinates
  const lastProcessTime = useRef(0);         // Throttling timer

  useEffect(() => {
    if (!videoRef.current) return;

    // Initialize Mediapipe Hands
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(onResults);

    // Use lower resolution to reduce processing
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        const now = Date.now();
        // Process frame at most every 100ms
        if (now - lastProcessTime.current < 100) return;
        lastProcessTime.current = now;
        await hands.send({ image: videoRef.current });
      },
      width: 320,
      height: 240,
    });
    camera.start();

    function onResults(results) {
      // Get the drawing canvas and its context
      if (!drawingCanvasRef.current) return;
      const canvas = drawingCanvasRef.current;
      const ctx = canvas.getContext('2d');

      // (Optional) Uncomment the next line to clear the canvas on each frame
      // ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Use the first detected hand
        const landmarks = results.multiHandLandmarks[0];
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // Mirror the x-coordinate (most webcam setups mirror the image)
        const indexX = canvasWidth - (landmarks[8].x * canvasWidth);
        const indexY = landmarks[8].y * canvasHeight;

        // (Optional) Gesture detection can be added here using landmarks.
        // For now, we assume that we always draw when a hand is detected.
        if (onGestureDetected) onGestureDetected('draw');

        // Draw a line from the previous coordinate to the current coordinate if available
        if (prevCoords.current) {
          ctx.beginPath();
          ctx.moveTo(prevCoords.current.x, prevCoords.current.y);
          ctx.lineTo(indexX, indexY);
          ctx.strokeStyle = "#FF0000";
          ctx.lineWidth = 3;
          ctx.stroke();

          // Emit the drawing event to other clients if needed
          if (socket) {
            socket.emit('draw', {
              roomId,
              senderId: localId,
              prevX: prevCoords.current.x,
              prevY: prevCoords.current.y,
              x: indexX,
              y: indexY,
              color: "#FF0000",
              lineWidth: 3,
              handGesture: true,
            });
          }
        }
        // Update previous coordinates
        prevCoords.current = { x: indexX, y: indexY };
      } else {
        // If no hand is detected, reset previous coordinates
        prevCoords.current = null;
      }
    }

    return () => {
      try {
        hands.close();
        camera.stop();
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
    };
  }, [onGestureDetected, socket, roomId, localId]);

  return (
    <div style={{ position: 'relative', width: '320px', height: '240px' }}>
      {/* Hidden video element for detection */}
      <video ref={videoRef} style={{ display: 'none' }} />
      {/* Drawing canvas */}
      <canvas
        ref={drawingCanvasRef}
        width="320"
        height="240"
        style={{ border: '1px solid #000' }}
      />
    </div>
  );
}

export default HandGesture;
