// client/src/HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId }) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);   // For video & landmarks
  const drawingCanvasRef = useRef(null);   // For persistent drawing overlay
  const prevCoords = useRef(null);         // To store previous index finger coordinates

  useEffect(() => {
    if (!videoRef.current) return;

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

    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        try {
          await hands.send({ image: videoRef.current });
        } catch (err) {
          console.error('Error sending frame:', err);
        }
      },
      width: 640,
      height: 480
    });
    camera.start();

    function onResults(results) {
      // Draw video feed and landmarks on video canvas
      if (videoCanvasRef.current) {
        const videoCtx = videoCanvasRef.current.getContext('2d');
        videoCtx.save();
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];

          // Count extended fingers (simple heuristic)
          let extendedFingers = 0;
          if (landmarks[8].y < landmarks[6].y) extendedFingers++; // index
          if (landmarks[12].y < landmarks[10].y) extendedFingers++; // middle
          if (landmarks[16].y < landmarks[14].y) extendedFingers++; // ring
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
          onGestureDetected && onGestureDetected(gesture);

          // Draw hand landmarks
          drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawingUtils.drawLandmarks(videoCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

          // Process drawing if gesture is "draw"
          const indexX = landmarks[8].x * videoCanvasRef.current.width;
          const indexY = landmarks[8].y * videoCanvasRef.current.height;
          if (gesture === 'draw') {
            if (drawingCanvasRef.current) {
              const drawCtx = drawingCanvasRef.current.getContext('2d');
              if (prevCoords.current) {
                // Draw the line segment locally on the drawing canvas
                drawCtx.beginPath();
                drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
                drawCtx.lineTo(indexX, indexY);
                drawCtx.strokeStyle = "#FF0000";
                drawCtx.lineWidth = 3;
                drawCtx.stroke();
                
                // Log to verify emission
                console.log('Emitting draw event:', {
                  roomId,
                  prevX: prevCoords.current.x,
                  prevY: prevCoords.current.y,
                  x: indexX,
                  y: indexY,
                  color: "#FF0000",
                  lineWidth: 3
                });
                
                // Emit the drawing event so that others get it
                if (socket) {
                  socket.emit('draw', {
                    roomId,
                    prevX: prevCoords.current.x,
                    prevY: prevCoords.current.y,
                    x: indexX,
                    y: indexY,
                    color: "#FF0000",
                    lineWidth: 3
                  });
                }
              }
              prevCoords.current = { x: indexX, y: indexY };
            }
          } else {
            // If not drawing, reset previous coordinates
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

  }, [onGestureDetected, socket, roomId]);

  return (
    <div style={{ position: 'relative', width: '640px', height: '480px' }}>
      {/* Hidden video element */}
      <video ref={videoRef} style={{ display: 'none' }} />
      {/* Canvas for video feed and landmarks */}
      <canvas
        ref={videoCanvasRef}
        width="640"
        height="480"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      />
      {/* Canvas for persistent drawing */}
      <canvas
        ref={drawingCanvasRef}
        width="640"
        height="480"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, pointerEvents: 'none' }}
      />
    </div>
  );
}

export default HandGesture;
