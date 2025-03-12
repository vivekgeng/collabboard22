// HandGesture.js
import React, { useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
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
      maxNumHands: 2, // Increase to detect both hands
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
          // Choose the right hand if available, otherwise use the first hand detected.
          let handIndex = 0;
          if (results.multiHandedness && results.multiHandedness.length > 0) {
            const rightHandIndex = results.multiHandedness.findIndex(
              (hand) => hand.label === "Right"
            );
            if (rightHandIndex !== -1) {
              handIndex = rightHandIndex;
            }
          }
          const landmarks = results.multiHandLandmarks[handIndex];

          // Count extended fingers (simple heuristic)
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
                drawCtx.beginPath();
                drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
                drawCtx.lineTo(indexX, indexY);
                drawCtx.strokeStyle = "#FF0000";
                drawCtx.lineWidth = 3;
                drawCtx.stroke();
                // Emit the drawing event with handGesture flag true
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
