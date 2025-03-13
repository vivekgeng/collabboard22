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

  // Gesture detection based on landmarks
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.07;
    const THUMB_THRESHOLD = 0.05;
    // Using handedness for info only; we'll mirror for both
    const isRightHand = handedness === 'Right';

    // Guard against missing landmarks
    if (!landmarks || !landmarks[8]) return { gesture: '', isRightHand };

    const indexTip = landmarks[8];
    const indexDip = landmarks[6];
    const middleTip = landmarks[12];
    const middleDip = landmarks[10];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];

    const indexExtended = indexTip.y < indexDip.y - FINGER_THRESHOLD;
    const middleExtended = middleTip.y < middleDip.y - FINGER_THRESHOLD;
    const thumbExtended = Math.abs(thumbTip.x - thumbIp.x) > THUMB_THRESHOLD;

    let extendedFingers = 0;
    const fingers = [
      { tip: 8, dip: 6 }, { tip: 12, dip: 10 },
      { tip: 16, dip: 14 }, { tip: 20, dip: 18 }
    ];
    
    fingers.forEach(({ tip, dip }) => {
      if (landmarks[tip]?.y < landmarks[dip]?.y - FINGER_THRESHOLD) extendedFingers++;
    });

    let gesture = '';
    if (extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if (extendedFingers === 2 && indexExtended && middleExtended) {
      gesture = 'stop';
    } else if (extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    }

    return { gesture, isRightHand };
  }, []);

  // Process drawing events (hand gesture drawing)
  const processDrawing = useCallback((landmarks, gesture) => {
    // Guard: make sure the landmark for index finger tip exists
    if (!landmarks || !landmarks[8]) return;

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    
    // Get normalized coordinates (0-1)
    const rawX = landmarks[8].x;
    const rawY = landmarks[8].y;

    // Ensure coordinates are not null
    if (rawX == null || rawY == null) return;

    // Mirror the x-coordinate to match video mirroring
    const canvasX = canvas.width - (rawX * canvas.width);
    const canvasY = rawY * canvas.height;

    const drawCtx = canvas.getContext('2d');
    const MIN_DISTANCE = 2; // Minimum movement in pixels required to draw

    switch (gesture) {
      case 'draw':
        animationFrameRef.current = requestAnimationFrame(() => {
          if (!prevCoords.current) {
            // Start a new path and emit the starting point
            prevCoords.current = { x: canvasX, y: canvasY };
            drawCtx.beginPath();
            drawCtx.moveTo(canvasX, canvasY);
            drawCtx.strokeStyle = "#FF0000";
            drawCtx.lineWidth = 3;
            socket?.emit('draw', {
              roomId,
              senderId: localId,
              prevX: canvasX,
              prevY: canvasY,
              x: canvasX,
              y: canvasY,
              color: "#FF0000",
              lineWidth: 3,
              handGesture: true
            });
            return;
          }
          // Calculate the distance moved
          const dx = canvasX - prevCoords.current.x;
          const dy = canvasY - prevCoords.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          // Only draw if movement is significant
          if (distance < MIN_DISTANCE) {
            return;
          }
          // Draw line to the new position
          drawCtx.lineTo(canvasX, canvasY);
          drawCtx.stroke();
          // Emit drawing data to other clients
          socket?.emit('draw', {
            roomId,
            senderId: localId,
            prevX: prevCoords.current.x,
            prevY: prevCoords.current.y,
            x: canvasX,
            y: canvasY,
            color: "#FF0000",
            lineWidth: 3,
            handGesture: true
          });
          prevCoords.current = { x: canvasX, y: canvasY };
        });
        break;
      case 'stop':
        drawCtx.closePath();
        prevCoords.current = null;
        break;
      default:
        prevCoords.current = null;
    }
  }, [socket, roomId, localId]);

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
        
        // Clear video overlay and draw mirrored video feed
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.save();
        videoCtx.scale(-1, 1); // Mirror the video feed
        videoCtx.drawImage(results.image, -640, 0);
        videoCtx.restore();

        if (results.multiHandLandmarks) {
          results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            const { gesture } = detectGesture(landmarks, handedness);

            if (gesture === 'clear') {
              drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
              prevCoords.current = null;
            }

            if (gesture) {
              onGestureDetected?.(gesture);
              processDrawing(landmarks, gesture);
            }

            // Draw hand landmarks for debugging
            drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, {
              color: '#00FF00',
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

    // Include processDrawing in dependencies to satisfy ESLint
    initHandTracking();
  }, [onGestureDetected, detectGesture, processDrawing]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '640px', 
      height: '480px'
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
          zIndex: 1
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
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}

export default memo(HandGesture);