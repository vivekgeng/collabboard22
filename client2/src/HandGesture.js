// HandGesture.js
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const prevCoords = useRef(null);
  const animationFrameRef = useRef(null);
  const abortController = useRef(new AbortController());

  // Fixed: Detect both hands and handle mirroring
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.08;
    
    // Flip X coordinates for mirror effect correction
    const flipX = (x) => 1 - x; // Correct mirror effect
    
    const indexExtended = landmarks[8].y < landmarks[6].y - FINGER_THRESHOLD;
    const middleExtended = landmarks[12].y < landmarks[10].y - FINGER_THRESHOLD;
    const ringExtended = landmarks[16].y < landmarks[14].y - FINGER_THRESHOLD;
    const pinkyExtended = landmarks[20].y < landmarks[18].y - FINGER_THRESHOLD;
    const thumbExtended = landmarks[4].x < landmarks[3].x;

    const extendedFingers = [indexExtended, middleExtended, ringExtended, pinkyExtended]
      .filter(Boolean).length;

    let gesture = '';
    if (extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if (extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    } else if (extendedFingers === 2 && indexExtended && middleExtended) {
      gesture = 'stop';
    } else if (extendedFingers === 4) {
      gesture = 'process';
    }
    
    return { gesture, flipX };
  }, []);

  useEffect(() => {
    const initHandTracking = async () => {
      if (!videoRef.current) return;

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      // Fixed: Enable both hands detection
      hands.setOptions({
        maxNumHands: 2, // Changed from 1 to 2
        modelComplexity: 0,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      const camera = new cam.Camera(videoRef.current, {
        onFrame: async () => {
          if (abortController.current.signal.aborted) return;
          try {
            await hands.send({ image: videoRef.current });
          } catch (err) {
            if (!err.message.includes('aborted')) {
              console.error('Error sending frame:', err);
            }
          }
        },
        width: 320,
        height: 240
      });

      hands.onResults((results) => {
        if (!videoCanvasRef.current) return;

        const videoCtx = videoCanvasRef.current.getContext('2d');
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        if (results.multiHandLandmarks) {
          // Fixed: Detect right hand and correct drawing direction
          results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index];
            const { gesture, flipX } = detectGesture(landmarks, handedness);
            
            // Prefer right hand or first detected hand
            if (handedness.label === 'Right' || index === 0) {
              if (gesture) {
                onGestureDetected?.(gesture);
                processDrawing(landmarks, gesture, flipX);
              }
            }

            drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, 
              { color: '#00FF00', lineWidth: 2 });
          });
        }
      });

      camera.start();
      return () => {
        abortController.current.abort();
        camera.stop();
        hands.close();
        cancelAnimationFrame(animationFrameRef.current);
      };
    };

    initHandTracking();
  }, [onGestureDetected, detectGesture]);

  // Fixed: Add flipX to correct drawing direction
  const processDrawing = useCallback((landmarks, gesture, flipX) => {
    const indexX = (flipX ? (1 - landmarks[8].x) : landmarks[8].x) * videoCanvasRef.current.width;
    const indexY = landmarks[8].y * videoCanvasRef.current.height;

    if (gesture === 'draw') {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!drawingCanvasRef.current) return;

        const drawCtx = drawingCanvasRef.current.getContext('2d');
        if (prevCoords.current) {
          drawCtx.beginPath();
          drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
          drawCtx.lineTo(indexX, indexY);
          drawCtx.stroke();

          socket?.emit('draw', {
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
        prevCoords.current = { x: indexX, y: indexY };
      });
    } else {
      prevCoords.current = null;
    }
  }, [socket, roomId, localId]);

  return (
    <div style={{ position: 'relative', width: '640px', height: '480px' }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas
        ref={videoCanvasRef}
        width="640"
        height="480"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      />
      <canvas
        ref={drawingCanvasRef}
        width="640"
        height="480"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, pointerEvents: 'none' }}
      />
    </div>
  );
}

export default memo(HandGesture);