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

  // Improved gesture detection with right-hand support
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.07;
    const THUMB_THRESHOLD = 0.05;

    // Flip X coordinate for right hand to correct mirror effect
    const flipX = handedness === 'Right';

    // Finger landmarks (improved accuracy)
    const indexTip = landmarks[8];
    const indexDip = landmarks[6];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];

    // Finger extension checks
    const indexExtended = indexTip.y < indexDip.y - FINGER_THRESHOLD;
    const thumbExtended = thumbTip.x < thumbIp.x - THUMB_THRESHOLD;

    // Count extended fingers (excluding thumb)
    let extendedFingers = 0;
    for(let i=8; i<=20; i+=4) {
      if(landmarks[i].y < landmarks[i-2].y - FINGER_THRESHOLD) extendedFingers++;
    }

    let gesture = '';
    if(extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if(extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    }

    return { gesture, flipX };
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
        
        // Clear both canvases
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.drawImage(results.image, 0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);

        // Clear drawing canvas when not drawing
        if(!results.multiHandLandmarks?.length) {
          drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
        }

        if (results.multiHandLandmarks) {
          results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            const { gesture, flipX } = detectGesture(landmarks, handedness);

            if(gesture === 'clear') {
              drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
            }

            if(gesture) {
              onGestureDetected?.(gesture);
              processDrawing(landmarks, gesture, flipX, handedness);
            }

            drawingUtils.drawConnectors(videoCtx, landmarks, Hands.HAND_CONNECTIONS, 
              { color: handedness === 'Right' ? '#00FF00' : '#FF0000', lineWidth: 2 });
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

  // Improved drawing with precise coordinates
  const processDrawing = useCallback((landmarks, gesture, flipX, handedness) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    // Get precise index finger coordinates
    const indexX = flipX ? 
      (1 - landmarks[8].x) * canvas.width : // Flip X for right hand
      landmarks[8].x * canvas.width;
      
    const indexY = landmarks[8].y * canvas.height;

    // Adjust for camera offset (if needed)
    const adjustedX = indexX;
    const adjustedY = indexY;

    if (gesture === 'draw') {
      animationFrameRef.current = requestAnimationFrame(() => {
        const drawCtx = canvas.getContext('2d');
        if (prevCoords.current) {
          drawCtx.beginPath();
          drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
          drawCtx.lineTo(adjustedX, adjustedY);
          drawCtx.strokeStyle = "#FF0000";
          drawCtx.lineWidth = 3;
          drawCtx.stroke();

          socket?.emit('draw', {
            roomId,
            senderId: localId,
            prevX: prevCoords.current.x,
            prevY: prevCoords.current.y,
            x: adjustedX,
            y: adjustedY,
            color: "#FF0000",
            lineWidth: 3,
            handGesture: true
          });
        }
        prevCoords.current = { x: adjustedX, y: adjustedY };
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
      transform: 'scaleX(-1)' // Mirror the display
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
          pointerEvents: 'none',
          transform: 'scaleX(-1)' // Match mirror for drawing
        }}
      />
    </div>
  );
}

export default memo(HandGesture);