import React, { useRef, useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import DOMPurify from 'dompurify';

function Whiteboard({ socket, roomId, localId, onActivePageChange }) {
  const [pages, setPages] = useState([{ 
    id: Date.now(), 
    imageData: ''
  }]);
  const [activePage, setActivePage] = useState(0);
  const canvasRefs = useRef([]);
  const contextRefs = useRef([]);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  // const [aiResponse, setAiResponse] = useState('');
  // const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const isDrawing = useRef(false);
  const prevCoords = useRef(null);
  const [currentStrokeId, setCurrentStrokeId] = useState(null);
  const [receivedStrokes, setReceivedStrokes] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 60 });
  const [dimensions, setDimensions] = useState({ width: 300, height: 200 });
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const aiRef = useRef(null);
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const rect = aiRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && aiRef.current) {
        aiRef.current.style.left = `${e.clientX - position.x}px`;
        aiRef.current.style.top = `${e.clientY - position.y}px`;
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);
  useEffect(() => {
    const handleAddPage = (newPage) => {
      setPages(prev => {
        const updatedPages = [...prev, newPage];
        setActivePage(updatedPages.length - 1);
        return updatedPages;
      });
    };

    const handleRemovePage = (pageId) => {
      setPages(prev => {
        const updatedPages = prev.filter(page => page.id !== pageId);
        setActivePage(prevActive => Math.min(prevActive, updatedPages.length - 1));
        return updatedPages;
      });
    };

    const changePage = (newPageIndex) => {
      setActivePage(newPageIndex);
      onActivePageChange?.(newPageIndex); // Call the parent handler
    };

    const handleAIResponse = (data) => {
      setAiResponse(data.response);
      setIsLoadingAI(false);
    };

    socket?.on('addPage', handleAddPage);
    socket?.on('removePage', handleRemovePage);
    socket?.on('aiResponse', handleAIResponse);

    return () => {
      socket?.off('addPage', handleAddPage);
      socket?.off('removePage', handleRemovePage);
      socket?.off('aiResponse', handleAIResponse);
    };
  }, [socket]);

  useEffect(() => {
    pages.forEach((page, index) => {
      const canvas = canvasRefs.current[index];
      if (canvas) {
        if (!canvas.dataset.initialized) {
          canvas.width = 640;
          canvas.height = 480;
          canvas.dataset.initialized = 'true';
        }
  
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        contextRefs.current[index] = ctx;
  
        if (page.imageData) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, 640, 480);
            ctx.drawImage(img, 0, 0);
          };
          img.src = page.imageData;
        }
      }
    });
  }, [pages, color, lineWidth]);

  useEffect(() => {
    const saveCurrentState = () => {
      const canvas = canvasRefs.current[activePage];
      if (canvas) {
        const imageData = canvas.toDataURL();
        setPages(prev => prev.map((page, idx) => 
          idx === activePage ? { ...page, imageData } : page
        ));
        socket?.emit('updatePageState', { 
          roomId, 
          pageId: pages[activePage].id,
          imageData 
        });
      }
    };
    return () => saveCurrentState();
  }, [activePage, socket, roomId]);

  useEffect(() => {
    const handleFullUpdate = (serverPages) => {
      setPages(serverPages);
      setActivePage(serverPages.length - 1);
    };
  
    socket?.on('fullPageUpdate', handleFullUpdate);
    return () => socket?.off('fullPageUpdate', handleFullUpdate);
  }, [socket]);
  
  useEffect(() => {
    socket?.emit('requestInitialState', roomId);
    socket?.on('initialState', (serverPages) => {
      setPages(serverPages);
    });
  }, [socket, roomId]);

  const startDrawing = (e) => {
    isDrawing.current = true;
    const coords = getCanvasCoordinates(e);
    const ctx = contextRefs.current[activePage];
    const strokeId = `${localId}-${Date.now()}`;
    setCurrentStrokeId(strokeId);

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    prevCoords.current = coords;

    socket?.emit('draw', {
      roomId,
      senderId: localId,
      strokeId: strokeId,
      x: coords.x,
      y: coords.y,
      prevX: coords.x,
      prevY: coords.y,
      color: isErasing ? '#FFFFFF' : color,
      lineWidth: isErasing ? eraserSize : lineWidth,
      page: activePage,
      compositeOperation: isErasing ? 'destination-out' : 'source-over',
      isNewStroke: true,
      handGesture: false
    });
  };

  const draw = (e) => {
    if (!isDrawing.current || !currentStrokeId) return;
    const coords = getCanvasCoordinates(e);
    const ctx = contextRefs.current[activePage];
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    socket?.emit('draw', {
      roomId,
      senderId: localId,
      strokeId: currentStrokeId,
      x: coords.x,
      y: coords.y,
      prevX: prevCoords.current.x,
      prevY: prevCoords.current.y,
      color: isErasing ? '#FFFFFF' : color,
      lineWidth: isErasing ? eraserSize : lineWidth,
      page: activePage,
      compositeOperation: isErasing ? 'destination-out' : 'source-over',
      isNewStroke: false,
      handGesture: false
    });

    prevCoords.current = coords;
  };

  const endDrawing = () => {
    if (isDrawing.current && currentStrokeId) {
      socket?.emit('endStroke', {
        roomId,
        strokeId: currentStrokeId,
        page: activePage
      });
    }
    
    isDrawing.current = false;
    const ctx = contextRefs.current[activePage];
    ctx.closePath();
    setCurrentStrokeId(null);
    prevCoords.current = null;

    const canvas = canvasRefs.current[activePage];
    if (canvas) {
      const imageData = canvas.toDataURL();
      setPages(prev => prev.map((page, idx) => 
        idx === activePage ? { ...page, imageData } : page
      ));
      socket?.emit('updatePageState', { 
        roomId, 
        pageId: pages[activePage].id,
        imageData 
      });
    }
  };

  useEffect(() => {
    const handleDraw = (data) => {
      console.log("Received draw event:", data);
  // Check if handGesture flag is set correctly
  console.log("Is hand gesture:", data.handGesture);
      if (data.senderId === localId && !data.handGesture) return;
  
      const ctx = contextRefs.current[data.page];
      if (!ctx) return;
      
      const originalSettings = {
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        composite: ctx.globalCompositeOperation
      };
      
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth;
      ctx.globalCompositeOperation = data.compositeOperation || 'source-over';
      
      if (data.isNewStroke) {
        setReceivedStrokes(prev => ({
          ...prev, 
          [data.strokeId]: { 
            x: data.x, 
            y: data.y, 
            page: data.page 
          }
        }));
        
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
      } else {
        const stroke = receivedStrokes[data.strokeId];
        if (stroke && stroke.page === data.page) {
          ctx.beginPath();
          ctx.moveTo(data.prevX, data.prevY);
          ctx.lineTo(data.x, data.y);
          ctx.stroke();
          
          setReceivedStrokes(prev => ({
            ...prev,
            [data.strokeId]: { 
              ...prev[data.strokeId], 
              x: data.x, 
              y: data.y 
            }
          }));
        }
      }
      
      // After drawing, save the canvas state
      if (data.handGesture && data.page === activePage) {
        const canvas = canvasRefs.current[data.page];
        if (canvas) {
          const imageData = canvas.toDataURL();
          setPages(prev => prev.map((page, idx) => 
            idx === data.page ? { ...page, imageData } : page
          ));
          
          // Also emit this update to the server
          socket?.emit('updatePageState', { 
            roomId, 
            pageId: pages[data.page].id,
            imageData 
          });
        }
      }
      
      ctx.strokeStyle = originalSettings.strokeStyle;
      ctx.lineWidth = originalSettings.lineWidth;
      ctx.globalCompositeOperation = originalSettings.composite;
    };
    
    const handleEndStroke = (data) => {
      setReceivedStrokes(prev => {
        const newStrokes = { ...prev };
        delete newStrokes[data.strokeId];
        return newStrokes;
      });
    };
    
    socket?.on('draw', handleDraw);
    socket?.on('endStroke', handleEndStroke);
    
    return () => {
      socket?.off('draw', handleDraw);
      socket?.off('endStroke', handleEndStroke);
    };
  }, [socket, localId, pages, roomId, receivedStrokes]);

  useEffect(() => {
    const handleClearCanvas = (data) => {
      if (data.senderId === localId && !data.handGesture) return;
      
      const ctx = contextRefs.current[activePage];
      if (ctx) {
        ctx.clearRect(0, 0, 640, 480);
        
        // Update the page state
        const canvas = canvasRefs.current[activePage];
        if (canvas) {
          const imageData = canvas.toDataURL();
          setPages(prev => prev.map((page, idx) => 
            idx === activePage ? { ...page, imageData } : page
          ));
          
          // Sync with server
          socket?.emit('updatePageState', { 
            roomId, 
            pageId: pages[activePage].id,
            imageData 
          });
        }
      }
    };
    
    socket?.on('clearCanvas', handleClearCanvas);
    
    return () => {
      socket?.off('clearCanvas', handleClearCanvas);
    };
  }, [socket, localId, activePage, pages, roomId]);

  const addPage = () => {
    const canvas = canvasRefs.current[activePage];
    const imageData = canvas.toDataURL();
    const currentPageId = pages[activePage].id;
    socket?.emit('addPage', { roomId, imageData, pageId: currentPageId });
  };

  const removePage = (pageId) => {
    if (pages.length === 1) return;
    socket?.emit('removePage', { roomId, pageId });
  };

  const generatePDF = () => {
    const pdf = new jsPDF();
    
    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage();
      
      const originalCanvas = canvasRefs.current[index];
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = originalCanvas.width;
      tempCanvas.height = originalCanvas.height;
      
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(originalCanvas, 0, 0);
      
      const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);
      const width = pdf.internal.pageSize.getWidth() - 20;
      const height = (originalCanvas.height * width) / originalCanvas.width;
      
      pdf.addImage(imgData, 'JPEG', 10, 10, width, height);
    });

    pdf.save(`${roomId}-whiteboard.pdf`);
  };
  const aiPanel = (
    <div 
      ref={aiRef}
      style={{ 
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: '#ffffff',
        border: '1px solid #4F81E1',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        overflow: 'hidden',
        transition: 'all 0.2s ease'
      }}
      onMouseDown={handleMouseDown}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#4F81E1',
        color: 'white',
        padding: '10px',
        fontWeight: 'bold',
        userSelect: 'none'
      }}>
        AI Answers
        <button 
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0 4px'
          }}
          onClick={() => setDimensions(prev => ({
            width: prev.width === 300 ? 500 : 300,
            height: prev.height === 200 ? 300 : 200
          }))}
        >
          {dimensions.width === 300 ? '⤢' : '⤡'}
        </button>
      </div>
      <div style={{
        padding: '15px',
        overflowY: 'auto',
        height: 'calc(100% - 40px)',
        backgroundColor: 'rgba(248,249,250,0.95)'
      }}>
        {isLoadingAI ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}>
            <div style={{
              width: '30px',
              height: '30px',
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <p>Analyzing problem...</p>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ 
            __html: DOMPurify.sanitize(aiResponse) || 'Draw a math problem and pinch to analyze' 
          }}/>
        )}
      </div>
    </div>
  );
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRefs.current[activePage];
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const handleEraserToggle = () => {
    setIsErasing(prev => {
      pages.forEach((_, index) => {
        const ctx = contextRefs.current[index];
        if (ctx) {
          ctx.strokeStyle = !prev ? '#FFFFFF' : color;
          ctx.lineWidth = !prev ? eraserSize : lineWidth;
          ctx.globalCompositeOperation = !prev ? 'destination-out' : 'source-over';
        }
      });
      return !prev;
    });
  };
  const handleClear = () => {
    const ctx = contextRefs.current[activePage];
    ctx.clearRect(0, 0, 640, 480);
    socket?.emit('clearCanvas', { roomId, senderId: localId });
  };

  return (
    <div style={styles.whiteboardContainer}>
      <div style={styles.pageControls}>
        <button onClick={addPage} style={styles.addButton}>
          ➕ Add Page
        </button>
        {aiPanel}
        <div style={styles.pageTabs}>
          {pages.map((page, index) => (
            <div 
              key={page.id}
              style={index === activePage ? styles.activeTab : styles.pageTab}
              onClick={() => setActivePage(index)}
            >
              Page {index + 1}
              {pages.length > 1 && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removePage(page.id);
                  }}
                  style={styles.closeButton}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button onClick={generatePDF} style={styles.pdfButton}>
          📄 Save as PDF
        </button>
      </div>

      {pages.map((page, index) => (
        <canvas
          key={page.id}
          ref={el => (canvasRefs.current[index] = el)}
          style={{ 
            ...styles.canvas, 
            visibility: index === activePage ? 'visible' : 'hidden',
            position: index === activePage ? 'relative' : 'absolute'
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
        />
      ))}

      <div style={styles.tools}>
        <button 
          onClick={handleEraserToggle}
          style={isErasing ? styles.activeEraserButton : styles.eraserButton}
        >
          {isErasing ? '✏️ Disable Eraser' : '🧹 Eraser'}
        </button>
        
        {isErasing && (
          <input
            type="range"
            min="10"
            max="50"
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
          />
        )}
        
        <button onClick={handleClear} style={styles.clearButton}>
          Clear
        </button>
        
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)}
          disabled={isErasing}
        />
        
        <input
          type="range"
          min="1"
          max="10"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          disabled={isErasing}
        />
      </div>

      <div style={styles.aiContainer}>
        {/* <div style={styles.aiHeader}>AI Answers</div> */}
        {/* <div style={styles.aiContent}>
          {isLoadingAI ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Analyzing problem...</p>
            </div>
          ) : (
            <div 
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(aiResponse) || 'Draw a math problem and pinch to analyze' 
              }}
            />
          )}
        </div> */}
      </div>
    </div>
  );
}

const styles = {
  whiteboardContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'relative'
  },
  pageControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #ddd'
  },
  pageTabs: {
    display: 'flex',
    gap: '5px',
    flexGrow: 1,
    overflowX: 'auto'
  },
  pageTab: {
    padding: '8px 20px',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    cursor: 'pointer',
    borderRadius: '4px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  activeTab: {
    backgroundColor: '#4F81E1',
    color: 'white',
    borderColor: '#3a6db7'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: '0 4px'
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  pdfButton: {
    padding: '8px 16px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  canvas: {
    background: '#ffffff', // Ensure white background
    cursor: 'crosshair',
    flex: 1,
    minHeight: 0,
    aspectRatio: '4/3',
    touchAction: 'none',
    imageRendering: 'crisp-edges' // Keep lines sharp
  },
  tools: {
    padding: '10px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  clearButton: {
    padding: '8px 16px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  eraserButton: {
    padding: '8px 16px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  activeEraserButton: {
    backgroundColor: '#4F81E1',
    color: 'white'
  },
  aiContainer: {
    borderTop: '2px solid #4F81E1',
    backgroundColor: '#f8f9fa',
    height: '150px',
    minHeight: '150px'
  },
  aiHeader: {
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '10px',
    fontWeight: 'bold'
  },
  aiContent: {
    padding: '15px',
    overflowY: 'auto',
    height: '100%'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  },
  spinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

export default React.memo(Whiteboard);