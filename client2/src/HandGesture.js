import React, { useEffect, useRef, useCallback, memo, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';
import { GoogleGenerativeAI } from '@google/generative-ai';

function HandGesture({ 
  onGestureDetected, 
  socket, 
  roomId, 
  localId, 
  activePage,
  color,
  lineWidth 
}) {
  const videoRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const prevCoords = useRef(null);
  const animationFrameRef = useRef(null);
  const abortController = useRef(new AbortController());
  const genAI = useRef(null);
  const lastSubmissionTime = useRef(0);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  useEffect(() => {
    const updateCanvasDimensions = () => {
      [videoCanvasRef, drawingCanvasRef].forEach(ref => {
        if (ref.current) {
          ref.current.width = ref.current.clientWidth;
          ref.current.height = ref.current.clientHeight;
        }
      });
    };
    window.addEventListener('resize', updateCanvasDimensions);
    updateCanvasDimensions();
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, []);

  useEffect(() => {
    genAI.current = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  }, []);

  useEffect(() => {
    const handleAIError = () => setIsLoadingAI(false);
    socket?.on('aiError', handleAIError);
    return () => socket?.off('aiError', handleAIError);
  }, [socket]);

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

    const pinchDistance = Math.hypot(
      indexTip.x - thumbTip.x,
      indexTip.y - thumbTip.y
    );

    let gesture = '';
    if (extendedFingers === 1 && indexExtended && !thumbExtended) {
      gesture = 'draw';
    } else if (extendedFingers === 2 && indexExtended && middleExtended) {
      gesture = 'stop';
    } else if (extendedFingers === 0 && thumbExtended) {
      gesture = 'clear';
    }

    if (pinchDistance < PINCH_THRESHOLD) {
      gesture = 'submit';
    }

    return { gesture, isRightHand };
  }, []);

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
            drawCtx.strokeStyle = color;
            drawCtx.lineWidth = lineWidth;
            
            // Generate a unique stroke ID
            const strokeId = `${localId}-gesture-${Date.now()}`;
            
            socket?.emit('draw', {
              roomId,
              senderId: localId,
              strokeId: strokeId,
              x: canvasX,
              y: canvasY,
              prevX: canvasX,
              prevY: canvasY,
              color,
              lineWidth,
              page: activePage,
              compositeOperation: 'source-over',
              isNewStroke: true,
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
            strokeId: prevCoords.current.strokeId || `${localId}-gesture-${Date.now()}`,
            prevX: prevCoords.current.x,
            prevY: prevCoords.current.y,
            x: canvasX,
            y: canvasY,
            color,
            lineWidth,
            page: activePage,
            compositeOperation: 'source-over',
            isNewStroke: false,
            handGesture: true
          });
          
          prevCoords.current = { 
            x: canvasX, 
            y: canvasY, 
            strokeId: prevCoords.current.strokeId || `${localId}-gesture-${Date.now()}`
          };
        });
        break;
      case 'stop':
        drawCtx.closePath();
        
        if (prevCoords.current && prevCoords.current.strokeId) {
          socket?.emit('endStroke', {
            roomId,
            strokeId: prevCoords.current.strokeId,
            page: activePage
          });
        }
        
        prevCoords.current = null;
        break;
      default:
        prevCoords.current = null;
    }
  }, [socket, roomId, localId, activePage, color, lineWidth]);

  const processAISubmission = useCallback(async () => {
    const now = Date.now();
    if (now - lastSubmissionTime.current < 5000) return;
    lastSubmissionTime.current = now;
    setIsLoadingAI(true);

    try {
      const canvas = drawingCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const contentPixels = [...imageData].filter(val => val < 255).length;

      if (contentPixels < 100) {
        throw new Error('Drawing too simple');
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width * 2;
      tempCanvas.height = canvas.height * 2;
      const tempCtx = tempCanvas.getContext('2d');
      
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

      const enhancedImage = tempCanvas.toDataURL('image/jpeg', 0.9);

      socket?.emit('processWithAI', {
        roomId,
        image: enhancedImage,
        prompt: "Analyze this handwritten math problem carefully. " +
                "Even if some parts are unclear, try to make educated guesses. " +
                "Provide a step-by-step solution in clear, simple language."
      });
    } catch (error) {
      console.error('AI submission failed:', error);
      setIsLoadingAI(false);
      socket?.emit('aiError', { 
        roomId,
        message: error.message === 'Drawing too simple' 
          ? 'Please draw a more complete problem before submitting'
          : 'AI processing failed. Please try again.'
      });
    }
  }, [socket, roomId]);

  useEffect(() => {
    const initHandTracking = async () => {
      try {
        setCameraStarted(true);
        const videoElement = videoRef.current;

        if (!videoElement) return;

        videoElement.style.display = 'block';
        videoElement.style.transform = 'scaleX(-1)';

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.8,
          minTrackingConfidence: 0.8,
        });

        const camera = new cam.Camera(videoElement, {
          onFrame: async () => {
            if (abortController.current.signal.aborted) return;
            try {
              await hands.send({ image: videoElement });
            } catch (err) {
              console.error('Error sending frame:', err);
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
          videoElement.style.display = 'none';
          setCameraStarted(false);
        };
      } catch (error) {
        console.error('Camera initialization failed:', error);
        setCameraStarted(false);
      }
    };

    initHandTracking();
  }, [onGestureDetected, detectGesture, processDrawing, processAISubmission]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      overflow: 'hidden',
      aspectRatio: '4/3'
    }}>
      <video
        ref={videoRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'none'
        }}
        playsInline
      />

      <canvas
        ref={videoCanvasRef}
        width="640"
        height="480"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none'
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

      {!cameraStarted && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          zIndex: 3,
          textAlign: 'center'
        }}>
          <p>Starting camera...</p>
          <p>Please allow camera permissions</p>
        </div>
      )}

      {isLoadingAI && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          color: 'white',
          zIndex: 4,
          padding: '8px',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: '4px'
        }}>
          Analyzing problem...
        </div>
      )}
    </div>
  );
}

export default memo(HandGesture);