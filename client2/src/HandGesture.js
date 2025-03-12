// HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);           // Video element for camera feed
  const videoCanvasRef = useRef(null);       // Canvas for drawing landmarks/overlays
  const drawingCanvasRef = useRef(null);     // Canvas for persistent drawing
  const prevCoords = useRef(null);           // For storing previous index finger coordinates
  const lastProcessTime = useRef(0);

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

    // Use lower resolution to reduce processing load
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
      // Get the overlay canvas contexts
      if (videoCanvasRef.current) {
        const videoCtx = videoCanvasRef.current.getContext('2d');
        videoCtx.save();
        // Clear the overlay canvas
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        // (Optional) Draw the video image into the overlay if needed
        // videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];
          const canvasWidth = videoCanvasRef.current.width;
          const canvasHeight = videoCanvasRef.current.height;

          // Log handedness for debugging (optional)
          if (results.multiHandedness && results.multiHandedness.length > 0) {
            console.log("Detected hand label:", results.multiHandedness[0].classification[0].label);
          }

          // Simple gesture detection heuristic
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

          // Draw landmarks on the overlay canvas for debugging
          drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawingUtils.drawLandmarks(videoCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

          // Mirror the x-coordinate so drawing aligns with actual movement
          const rawX = landmarks[8].x * canvasWidth;
          const indexX = canvasWidth - rawX;
          const indexY = landmarks[8].y * canvasHeight;

          // Process drawing if gesture is "draw"
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
                // Emit drawing event with handGesture flag true
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
              prevCoords.current = { x: indexX, y: indexY };
            }
          } else {
            prevCoords.current = null;
          }
        } else {
          prevCoords.current = null;
        }
        videoCtx.restore();
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
      {/* Video element showing camera feed */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '320px', height: '240px', zIndex: 0 }}
        autoPlay
        playsInline
      />
      {/* Overlay canvas for landmarks (optional debugging) */}
      <canvas
        ref={videoCanvasRef}
        width="320"
        height="240"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      />
      {/* Drawing canvas for hand-gesture drawing */}
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
