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

  // Improved gesture detection with accurate right-hand handling
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.07;
    const THUMB_THRESHOLD = 0.05;
    const isRightHand = handedness === 'Right';

    // Finger landmarks with improved accuracy
    const indexTip = landmarks[8];
    const indexDip = landmarks[6];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];

    // Finger extension checks
    const indexExtended = indexTip.y < indexDip.y - FINGER_THRESHOLD;
    const thumbExtended = Math.abs(thumbTip.x - thumbIp.x) > THUMB_THRESHOLD;

    // Count extended fingers (excluding thumb)
    let extendedFingers = 0;
    for(let i = 8; i <= 20; i += 4) {
      if(landmarks[i].y < landmarks[i-2].y - FINGER_THRESHOLD) extendedFingers++;
    }

    let gesture = '';
    if(extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if(extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    }

    return { gesture, isRightHand };
  }, []);

  useEffect(() => {
    const initHandTracking = async () => {
      if (!videoRef.current) return;

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.8,
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
        width: 640,
        height: 480
      });

      hands.onResults((results) => {
        if (!videoCanvasRef.current || !drawingCanvasRef.current) return;

        const videoCtx = videoCanvasRef.current.getContext('2d');
        const drawCtx = drawingCanvasRef.current.getContext('2d');
        
        // Clear canvases
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        if (results.multiHandLandmarks) {
          results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            const { gesture, isRightHand } = detectGesture(landmarks, handedness);

            if(gesture === 'clear') {
              videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
              drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
              prevCoords.current = null;
            }

            if(gesture) {
              onGestureDetected?.(gesture);
              processDrawing(landmarks, gesture, isRightHand);
            }

            // Draw hand connections
            drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, {
              color: handedness === 'Right' ? '#00FF00' : '#FF0000',
              lineWidth: 2
            });
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

  // Corrected drawing logic with proper right-hand handling
  const processDrawing = useCallback((landmarks, gesture, isRightHand) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    // Get precise coordinates with mirror correction
    const rawX = landmarks[8].x;
    const rawY = landmarks[8].y;
    const correctedX = isRightHand ? (1 - rawX) : rawX;
    
    const indexX = correctedX * canvas.width;
    const indexY = rawY * canvas.height;

    if (gesture === 'draw') {
      animationFrameRef.current = requestAnimationFrame(() => {
        const drawCtx = canvas.getContext('2d');
        if (prevCoords.current) {
          // Draw smooth line
          drawCtx.beginPath();
          drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
          drawCtx.lineTo(indexX, indexY);
          drawCtx.strokeStyle = "#FF0000";
          drawCtx.lineWidth = 3;
          drawCtx.stroke();

          // Emit drawing data
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
    <div style={{ 
      position: 'relative', 
      width: '640px', 
      height: '480px',
      transform: 'scaleX(-1)' // Mirror only the container
    }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas
        ref={videoCanvasRef}
        width="640"
        height="480"
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          zIndex: 1,
          transform: 'scaleX(-1)' // Mirror the camera feed
        }}
      />
      <canvas
        ref={drawingCanvasRef}
        width="640"
        height="480"
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          zIndex: 2, 
          pointerEvents: 'none' // Drawing canvas remains unmirrored
        }}
      />
    </div>
  );
}

export default memo(HandGesture);