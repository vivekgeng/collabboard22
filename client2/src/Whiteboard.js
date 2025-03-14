import React, { useRef, useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import DOMPurify from 'dompurify';

function Whiteboard({ socket, roomId, localId }) {
  // State management
  const [pages, setPages] = useState([{ id: Date.now() }]);
  const [activePage, setActivePage] = useState(0);
  const canvasRefs = useRef([]);
  const contextRefs = useRef([]);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const isDrawing = useRef(false);
  const prevCoords = useRef(null);

  // Initialize canvases
  useEffect(() => {
    pages.forEach((_, index) => {
      const canvas = canvasRefs.current[index];
      if (canvas) {
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        contextRefs.current[index] = ctx;
      }
    });
  }, [pages.length, color, lineWidth]);

  // Page management
  const addPage = () => {
    const newPage = { id: Date.now() };
    setPages(prev => [...prev, newPage]);
    setActivePage(pages.length);
  };

  const removePage = (pageId) => {
    if (pages.length === 1) return;
    setPages(prev => prev.filter(page => page.id !== pageId));
    setActivePage(prev => Math.max(0, prev - 1));
  };

  // PDF Generation
  const generatePDF = () => {
    const pdf = new jsPDF();
    
    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage();
      
      // Create temporary canvas with white background
      const originalCanvas = canvasRefs.current[index];
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = originalCanvas.width;
      tempCanvas.height = originalCanvas.height;
      
      // Fill with white background
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(originalCanvas, 0, 0);
      
      // Add to PDF
      const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);
      const width = pdf.internal.pageSize.getWidth() - 20;
      const height = (originalCanvas.height * width) / originalCanvas.width;
      
      pdf.addImage(imgData, 'JPEG', 10, 10, width, height);
    });
  
    pdf.save(`${roomId}-whiteboard.pdf`);
  };
  save(`${roomId}-whiteboard.pdf`);
  };

  // Drawing logic
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRefs.current[activePage];
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const coords = getCanvasCoordinates(e);
    const ctx = contextRefs.current[activePage];
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    prevCoords.current = coords;
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const coords = getCanvasCoordinates(e);
    const ctx = contextRefs.current[activePage];
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    socket?.emit('draw', {
      roomId,
      senderId: localId,
      x: coords.x,
      y: coords.y,
      prevX: prevCoords.current.x,
      prevY: prevCoords.current.y,
      color: isErasing ? '#FFFFFF' : color,
      lineWidth: isErasing ? eraserSize : lineWidth,
      page: activePage,
      isErasing
    });

    prevCoords.current = coords;
  };

  const endDrawing = () => {
    isDrawing.current = false;
    const ctx = contextRefs.current[activePage];
    ctx.closePath();
    prevCoords.current = null;
  };

  // Socket handlers
  useEffect(() => {
    const handleDraw = (data) => {
      if (data.senderId === localId || data.page !== activePage) return;
      
      const ctx = contextRefs.current[activePage];
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth;
      ctx.beginPath();
      ctx.moveTo(data.prevX, data.prevY);
      ctx.lineTo(data.x, data.y);
      ctx.stroke();
    };

    socket?.on('draw', handleDraw);
    return () => socket?.off('draw', handleDraw);
  }, [socket, activePage, localId]);

  // Tool handlers
  const handleEraserToggle = () => setIsErasing(!isErasing);
  pages.forEach((_, index) => {
    const ctx = contextRefs.current[index];
    if (ctx) {
      ctx.strokeStyle = !isErasing ? '#FFFFFF' : color;
      ctx.lineWidth = !isErasing ? eraserSize : lineWidth;
      ctx.globalCompositeOperation = !isErasing ? 'destination-out' : 'source-over';
    }
  });

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
            display: index === activePage ? 'block' : 'none' 
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
          {isErasing ? '✏️ Disable Eraser' : '🧹 Eraser (Click to Activate)'}
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
        <div style={styles.aiHeader}>AI Answers</div>
        <div style={styles.aiContent}>
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
        </div>
      </div>
    </div>
  );


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
    background: '#ffffff',
    cursor: 'crosshair',
    flex: 1,
    minHeight: 0,
    aspectRatio: '4/3',
    touchAction: 'none'
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