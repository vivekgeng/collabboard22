import React, { useRef, useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import DOMPurify from 'dompurify';

function Whiteboard({ socket, roomId, localId }) {
  // State management
  const [pages, setPages] = useState([{ id: 0, data: [] }]);
  const [activePage, setActivePage] = useState(0);
  const canvasRefs = useRef([]);
  const contextRefs = useRef([]);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);

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
    const newPage = { id: pages.length, data: [] };
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
      const canvas = canvasRefs.current[index];
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const width = pdf.internal.pageSize.getWidth() - 20;
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 10, 10, width, height);
    });
    pdf.save(`${roomId}-whiteboard.pdf`);
  };

  // Drawing logic
  const getCanvasCoordinates = (clientX, clientY) => {
    const canvas = canvasRefs.current[activePage];
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e) => {
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    const ctx = contextRefs.current[activePage];
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    const ctx = contextRefs.current[activePage];
    if (!ctx || !e.buttons) return;
    
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();

    socket?.emit('draw', {
      roomId,
      senderId: localId,
      x,
      y,
      color: isErasing ? '#FFFFFF' : color,
      lineWidth: isErasing ? eraserSize : lineWidth,
      page: activePage,
      isErasing
    });
  };

  // Socket handlers
  useEffect(() => {
    const handleDraw = (data) => {
      if (data.senderId === localId || data.page !== activePage) return;
      
      const ctx = contextRefs.current[activePage];
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth;
      ctx.lineTo(data.x, data.y);
      ctx.stroke();
    };

    socket?.on('draw', handleDraw);
    return () => socket?.off('draw', handleDraw);
  }, [socket, activePage, localId]);

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
          ref={el => canvasRefs.current[index] = el}
          style={{ 
            ...styles.canvas, 
            display: index === activePage ? 'block' : 'none' 
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={() => contextRefs.current[activePage]?.closePath()}
          onMouseLeave={() => contextRefs.current[activePage]?.closePath()}
        />
      ))}

      <div style={styles.tools}>
        <button 
          onClick={handleEraserToggle}
          style={isErasing ? styles.activeEraserButton : styles.eraserButton}
          aria-label={isErasing ? 'Disable eraser' : 'Enable eraser'}
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
            aria-label="Adjust eraser size"
          />
        )}
        
        <button 
          onClick={handleClear} 
          style={styles.clearButton}
          aria-label="Clear whiteboard"
        >
          Clear
        </button>
        
        <label>Color: </label>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)}
          disabled={isErasing}
          aria-label="Select drawing color"
        />
        <label>Line Width: </label>
        <input
          type="range"
          min="1"
          max="10"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          disabled={isErasing}
          aria-label="Adjust line width"
        />
      </div>
      
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        aria-label="Collaborative whiteboard"
        role="img"
      />

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
              style={styles.responseText}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aiResponse) || 'Draw a math problem and pinch to analyze' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  whiteboardContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
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
    position: 'relative',
    borderRadius: '4px',
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
    aspectRatio: '4/3'
  },
  tools: {
    padding: '10px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  canvas: {
    background: '#ffffff',
    cursor: 'crosshair',
    touchAction: 'none',
    flex: 1,
    minHeight: 0,
    aspectRatio: '4/3'
  },
  clearButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'opacity 0.2s',
    ':hover': {
      opacity: 0.8
    }
  },
  eraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#5a6268'
    }
  },
  activeEraserButton: {
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    backgroundColor: '#4F81E1',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#3a6db7'
    }
  },
  aiContainer: {
    borderTop: '2px solid #4F81E1',
    backgroundColor: '#f8f9fa',
    height: '150px',
    minHeight: '150px',
    display: 'flex',
    flexDirection: 'column'
  },
  aiHeader: {
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '10px',
    fontWeight: 'bold',
    fontSize: '1.1rem'
  },
  aiContent: {
    flex: 1,
    padding: '15px',
    overflowY: 'auto',
    fontSize: '0.9rem',
    lineHeight: '1.5'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '0.5rem'
  },
  spinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  responseText: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
};

export default React.memo(Whiteboard);