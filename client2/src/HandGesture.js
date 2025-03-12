// HandGesture.js
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  // ... (keep previous refs and state)

  // Corrected gesture detection with proper right-hand handling
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.07;
    const THUMB_THRESHOLD = 0.05;

    // Correct hand detection logic
    const isRightHand = handedness === 'Right';
    
    // Get landmarks with proper hand orientation
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

    return { gesture, isRightHand };
  }, []);

  // Corrected drawing processing
  const processDrawing = useCallback((landmarks, gesture, isRightHand) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    // Get proper coordinates based on hand type
    const rawX = landmarks[8].x;
    const rawY = landmarks[8].y;
    
    // Correct mirroring for right hand
    const correctedX = isRightHand ? (1 - rawX) : rawX;
    
    const indexX = correctedX * canvas.width;
    const indexY = rawY * canvas.height;

    if (gesture === 'draw') {
      animationFrameRef.current = requestAnimationFrame(() => {
        const drawCtx = canvas.getContext('2d');
        if (prevCoords.current) {
          drawCtx.beginPath();
          drawCtx.moveTo(prevCoords.current.x, prevCoords.current.y);
          drawCtx.lineTo(indexX, indexY);
          drawCtx.strokeStyle = "#FF0000";
          drawCtx.lineWidth = 3;
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
    } else if (gesture === 'clear') {
      const videoCtx = videoCanvasRef.current.getContext('2d');
      videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      prevCoords.current = null;
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
          pointerEvents: 'none'
          // No transform here - drawing canvas remains unmirrored
        }}
      />
    </div>
  );
}

export default memo(HandGesture);