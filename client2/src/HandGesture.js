// HandGesture.js
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';
import { GoogleGenerativeAI } from '@google/generative-ai';

function HandGesture({ onGestureDetected, socket, roomId, localId }) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const prevCoords = useRef(null);
  const animationFrameRef = useRef(null);
  const abortController = useRef(new AbortController());
  const genAI = useRef(null);
  const lastSubmissionTime = useRef(0);

  // Initialize Gemini AI
  useEffect(() => {
    genAI.current = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  }, []);

  useEffect(() => {
    const context = contextRefs.current[activePage];
    if (!context) return;
  
    context.strokeStyle = isErasing ? '#FFFFFF' : color;
    context.lineWidth = isErasing ? eraserSize : lineWidth;
    context.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
  
  }, [isErasing, activePage, color, lineWidth, eraserSize]);

  // Gesture detection based on landmarks
  const detectGesture = useCallback((landmarks, handedness) => {
    const FINGER_THRESHOLD = 0.07;
    const THUMB_THRESHOLD = 0.05;
    const PINCH_THRESHOLD = 0.1;
    const isRightHand = handedness === 'Right';

    if (!landmarks || !landmarks[8]) return { gesture: '', isRightHand };

    const indexTip = landmarks[8];
    const indexDip = landmarks[6];
    const middleTip = landmarks[12];
    const middleDip = landmarks[10];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];

    // Calculate finger extensions
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

    // Calculate pinch distance
    const pinchDistance = Math.hypot(
      indexTip.x - thumbTip.x,
      indexTip.y - thumbTip.y
    );

    // Determine gesture
    let gesture = '';
    if (extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if (extendedFingers === 2 && indexExtended && middleExtended) {
      gesture = 'stop';
    } else if (extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    }
    
    // Override with submit gesture if detected
    if (pinchDistance < PINCH_THRESHOLD) {
      gesture = 'submit';
    }

    return { gesture, isRightHand };
  }, []);

  // Process drawing events
  const processDrawing = useCallback((landmarks, gesture) => {
    
    if (!landmarks || !landmarks[8]) return;

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    
    const rawX = landmarks[8].x;
    const rawY = landmarks[8].y;
    if (rawX == null || rawY == null) return;

    const canvasX = canvas.width - (rawX * canvas.width);
    const canvasY = rawY * canvas.height;
    const drawCtx = canvas.getContext('2d');
    const MIN_DISTANCE = 2;

    switch (gesture) {
      case 'draw':
        animationFrameRef.current = requestAnimationFrame(() => {
          if (!prevCoords.current) {
            prevCoords.current = { x: canvasX, y: canvasY };
            drawCtx.beginPath();
            drawCtx.moveTo(canvasX, canvasY);
            drawCtx.strokeStyle = "#FF0000";
            drawCtx.lineWidth = 3;
            socket?.emit('draw', {
              roomId,
              senderId: localId,
              page: activePage, 
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
          const dx = canvasX - prevCoords.current.x;
          const dy = canvasY - prevCoords.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < MIN_DISTANCE) return;
          
          drawCtx.lineTo(canvasX, canvasY);
          drawCtx.stroke();
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
  }, [socket, roomId, localId, activePage]);

  // Handle AI submission
  const processAISubmission = useCallback(async () => {
    const now = Date.now();
    if (now - lastSubmissionTime.current < 5000) return;
    lastSubmissionTime.current = now;

    try {
      const canvas = drawingCanvasRef.current;
      const imageData = canvas.toDataURL('image/png');
      
      socket?.emit('processWithAI', { 
        roomId,
        image: imageData,
        prompt: "Solve this math problem step by step. If it's not a math problem, say 'Please draw a math problem'."
      });
    } catch (error) {
      console.error('AI submission failed:', error);
    }
  }, [socket, roomId]);

  // Main hand tracking setup
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
        
        videoCtx.clearRect(0, 0, videoCanvasRef.current.width, videoCanvasRef.current.height);
        videoCtx.save();
        videoCtx.scale(-1, 1);
        videoCtx.drawImage(results.image, -640, 0);
        videoCtx.restore();

        if (results.multiHandLandmarks) {
          results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            const { gesture } = detectGesture(landmarks, handedness);

            // Handle gestures
            if (gesture === 'clear') {
              drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
              prevCoords.current = null;
            }
            else if (gesture === 'submit') {
              processAISubmission();
            }

            if (gesture) {
              onGestureDetected?.(gesture);
              processDrawing(landmarks, gesture);
            }

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

    initHandTracking();
  }, [onGestureDetected, detectGesture, processDrawing, processAISubmission]);

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