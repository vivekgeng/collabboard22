// HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);    // For video feed and landmarks
  const drawingCanvasRef = useRef(null);    // For persistent drawing overlay
  const prevCoords = useRef(null);          // For storing previous finger position
  const lastDrawTime = useRef(0);           // For throttling drawing events

  useEffect(() => {
    if (!videoRef.current) return;

    // Initialize Mediapipe Hands with lower complexity to reduce lag.
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,          // Only process one hand
      modelComplexity: 0,      // Lower complexity model for speed
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(onResults);

    // Lower resolution to reduce processing load.
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        try {
          await hands.send({ image: videoRef.current });
        } catch (err) {
          console.error('Error sending frame:', err);
        }
      },
      width: 320,    // Lower resolution width
      height: 240,   // Lower resolution height
    });
    camera.start();

    function onResults(results) {
      if (videoCanvasRef.current) {
        const videoCtx = videoCanvasRef.current.getContext('2d');
        // Clear and draw video image
        videoCtx.save();
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          // Use the first detected hand
          const landmarks = results.multiHandLandmarks[0];
          const canvasWidth = videoCanvasRef.current.width;
          const canvasHeight = videoCanvasRef.current.height;

          // Log handedness for debugging (optional)
          if (results.multiHandedness && results.multiHandedness.length > 0) {
            console.log("Detected hand label:", results.multiHandedness[0].classification[0].label);
          }

          // Heuristic: count extended fingers (simple version)
          let extendedFingers = 0;
          if (landmarks[8].y < landmarks[6].y) extendedFingers++;
          if (landmarks[12].y < landmarks[10].y) extendedFingers++;
          if (landmarks[16].y < landmarks[14].y) extendedFingers++;
          if (landmarks[20].y < landmarks[18].y) extendedFingers++;
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

          // Draw landmarks on video canvas for debugging
          drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawingUtils.drawLandmarks(videoCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

          // Always mirror the x-coordinate for proper mapping
          const rawX = landmarks[8].x * canvasWidth;
          const indexX = canvasWidth - rawX;
          const indexY = landmarks[8].y * canvasHeight;

          // Throttle drawing to once every 50ms (adjust as needed)
          const now = Date.now();
          if (gesture === 'draw' && now - lastDrawTime.current > 50) {
            lastDrawTime.current = now;
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
                    handGesture: true
                  });
                }
              }
              prevCoords.current = { x: indexX, y: indexY };
            }
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
      {/* Hidden video element */}
      <video ref={videoRef} style={{ display: 'none' }} />
      {/* Canvas for video feed and landmarks */}
      <canvas
        ref={videoCanvasRef}
        width="320"
        height="240"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      />
      {/* Canvas for persistent drawing */}
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
