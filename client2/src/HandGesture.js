// HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);           // Shows the camera feed
  const overlayCanvasRef = useRef(null);     // For drawing landmarks (debug overlay)
  const drawingCanvasRef = useRef(null);     // For hand-gesture drawing
  const prevCoords = useRef(null);           // Previous index finger position
  const lastProcessTime = useRef(0);         // For throttling processing

  useEffect(() => {
    if (!videoRef.current) return;
    
    // Initialize Mediapipe Hands
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });
    
    hands.onResults(onResults);
    
    // Set up the camera with a lower resolution for performance.
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        const now = Date.now();
        if (now - lastProcessTime.current < 100) return; // process every 100ms
        lastProcessTime.current = now;
        await hands.send({ image: videoRef.current });
      },
      width: 320,
      height: 240,
    });
    camera.start();
    
    function onResults(results) {
      // First, update the overlay canvas (for landmarks)
      if (overlayCanvasRef.current) {
        const overlayCtx = overlayCanvasRef.current.getContext('2d');
        overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];
          // Draw landmarks and connections for debugging
          drawingUtils.drawConnectors(overlayCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawingUtils.drawLandmarks(overlayCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
          
          const canvasWidth = overlayCanvasRef.current.width;
          const canvasHeight = overlayCanvasRef.current.height;
          // Calculate index finger tip coordinate and mirror the x-coordinate (since video is mirrored)
          const rawX = landmarks[8].x * canvasWidth;
          const indexX = canvasWidth - rawX;
          const indexY = landmarks[8].y * canvasHeight;
          
          // Basic gesture detection heuristic
          let extendedFingers = 0;
          if (landmarks[8].y < landmarks[6].y) extendedFingers++; // index finger
          if (landmarks[12].y < landmarks[10].y) extendedFingers++; // middle finger
          if (landmarks[16].y < landmarks[14].y) extendedFingers++; // ring finger
          if (landmarks[20].y < landmarks[18].y) extendedFingers++; // pinky
          let thumbExtended = landmarks[4].x < landmarks[3].x;
          let gesture = '';
          if (extendedFingers === 1 && !thumbExtended) {
            gesture = 'draw';
          } else if (extendedFingers === 0 && thumbExtended) {
            gesture = 'clear';
          } else if (extendedFingers === 2) {
            gesture = 'stop';
          } else if (extendedFingers === 4) {
            gesture = 'process';
          }
          if (onGestureDetected) onGestureDetected(gesture);
          
          // Process drawing only when gesture is "draw"
          if (gesture === 'draw') {
            if (drawingCanvasRef.current) {
              const drawCtx = drawingCanvasRef.current.getContext('2d');
              if (prevCoords.current) {
                drawCtx.beginPath();
                drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
                drawCtx.lineTo(indexX, indexY);
                drawCtx.strokeStyle = "#FF0000";
                drawCtx.lineWidth = 3;
                drawCtx.stroke();
                // Emit drawing event so other clients get the update
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
                    handGesture: true
                  });
                }
              }
              prevCoords.current = { x: indexX, y: indexY };
            }
          } else {
            prevCoords.current = null;
          }
        } else {
          prevCoords.current = null;
          overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
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
      {/* Video feed visible in background */}
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '320px',
          height: '240px',
          zIndex: 0,
          objectFit: 'cover'
        }}
        autoPlay
        playsInline
      />
      {/* Overlay canvas for landmarks (z-index 1) */}
      <canvas
        ref={overlayCanvasRef}
        width="320"
        height="240"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      />
      {/* Drawing canvas for hand-gesture drawing (z-index 2) */}
      <canvas
        ref={drawingCanvasRef}
        width="320"
        height="240"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, pointerEvents: 'none' }}
      />
    </div>
  );
}

export default HandGesture;
