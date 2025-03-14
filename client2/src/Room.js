// Room.js
import React, { useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { useParams, useNavigate } from 'react-router-dom';
import Whiteboard from './Whiteboard';
import Chat from './Chat';
import HandGesture from './HandGesture';

const SERVER_URL = 'https://collabboard22.onrender.com';

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [localId, setLocalId] = useState(null);
  const [handGestureMode, setHandGestureMode] = useState(false);
  const [gestureStatus, setGestureStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  
  // Notification states
  const [notification, setNotification] = useState('');
  const [viewersCount, setViewersCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);

  // Persistent user ID
  const [userId] = useState(() => {
    const storedId = localStorage.getItem('collabUserId');
    if (storedId) return storedId;
    const newId = `user-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('collabUserId', newId);
    return newId;
  });

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
      upgrade: false,
      reconnectionAttempts: 3,
      timeout: 5000,
      query: { userId } // Send user ID with connection
    });

    const connectionTimer = setTimeout(() => {
      if (!newSocket.connected) {
        setConnectionError(true);
        setLoading(false);
      }
    }, 10000);

    newSocket.on('connect', () => {
      clearTimeout(connectionTimer);
      setLocalId(newSocket.id);
      setLoading(false);
      setConnectionError(false);
      newSocket.emit('joinRoom', { roomId, userId });
    });

    newSocket.on('connect_error', () => {
      setConnectionError(true);
      setLoading(false);
    });

// Modify the force-update-count listener
newSocket.on('force-update-count', (count) => {
  setViewersCount(count);
  console.log('Force updated count:', count);
});

    newSocket.on('user-joined', (data) => {
      setViewersCount(data.participants); // Always update directly
      setNotification(`${data.username} joined`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    });

    newSocket.on('user-left', (data) => {
      setViewersCount(data.participants); // Update with server-provided count
      setNotification(`${data.username} left`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    });

    setSocket(newSocket);

    return () => {
      clearTimeout(connectionTimer);
      newSocket.disconnect();
    };
  }, [roomId, userId]);

  const leaveRoom = useCallback(() => {
    localStorage.removeItem('collabUserId');
    navigate('/');
  }, [navigate]);
  
  const toggleHandGestureMode = useCallback(() => {
    setHandGestureMode(prev => !prev);
  }, []);

  const handleGesture = useCallback((gesture) => {
    setGestureStatus(gesture);
    if (gesture === 'clear' && socket) {
      socket.emit('clearCanvas', { roomId, senderId: localId });
    }
  }, [socket, roomId, localId]);

  if (connectionError) {
    return (
      <div style={styles.errorContainer}>
        <h2>Connection Failed</h2>
        <p>Unable to connect to the server. Please try again later.</p>
        <button style={styles.retryButton} onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Connecting to room {roomId}...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
    {/* Notification Popup */}
    {showNotification && (
    <div style={styles.notificationPopup}>
    <div style={styles.eyeIcon}>👀</div>
    <div>
    <p>{notification}</p>
    <small>Total viewers: {viewersCount}</small>
    </div>
    </div>
    )}
    
    <header style={styles.header}>
    <h1 style={styles.title}>CollabAI - Room: {roomId}</h1>
    <div style={styles.viewerCount}>
    <span style={styles.eyeIcon}>👀</span>
    {viewersCount}
    </div>
    <div style={styles.buttonGroup}>
    <button
    onClick={toggleHandGestureMode}
    style={handGestureMode ? styles.activeGestureButton : styles.handGestureButton}
    aria-label={handGestureMode ? 'Disable hand gestures' : 'Enable hand gestures'}
    >
    {handGestureMode ? '✋ Disable Gestures' : '👆 Hand Gestures'}
    </button>
    <button
    onClick={leaveRoom}
    style={styles.leaveButton}
    aria-label="Leave collaboration room"
    >
    🚪 Leave Room
    </button>
    </div>
    </header>

      <div style={styles.mainContent}>
        <div style={styles.whiteboardSection}>
          <Whiteboard socket={socket} roomId={roomId} localId={localId} />
        </div>
        
        {handGestureMode && (
          <div style={styles.gestureSection}>
            <HandGesture 
              socket={socket} 
              roomId={roomId} 
              onGestureDetected={handleGesture} 
              localId={localId} 
            />
            <div style={styles.gestureStatus}>
              Active Gesture: <strong>{gestureStatus || 'None'}</strong>
            </div>
          </div>
        )}

        <div style={styles.chatSection}>
          <Chat socket={socket} roomId={roomId} />
        </div>
      </div>
    </div>
  );
}


const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#f8f9fa'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    zIndex: 100
  },
  title: {
    fontSize: '1.5rem',
    margin: 0,
    color: '#2c3e50'
  },
  buttonGroup: {
    display: 'flex',
    gap: '1rem'
  },
  handGestureButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#218838'
    }
  },
  activeGestureButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#c82333'
    }
  },
  leaveButton: {
    backgroundColor: '#4F81E1',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: '#3a6db7'
    }
  },
  mainContent: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
    gridTemplateRows: '1fr auto',
    gap: '1rem',
    padding: '1rem',
    height: 'calc(100vh - 80px)',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'auto auto auto'
    }
  },
  whiteboardSection: {
    gridRow: '1 / 3',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  },
  gestureSection: {
    gridColumn: 2,
    gridRow: '1 / 2',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: '1rem'
  },
  chatSection: {
    gridColumn: 2,
    gridRow: '2 / 3',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  },
  gestureStatus: {
    padding: '0.5rem',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    textAlign: 'center',
    fontSize: '0.9rem'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '1rem'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '1rem',
    textAlign: 'center'
  },
  retryButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#4F81E1',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
  },

  notificationPopup: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '15px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    animation: 'slideIn 0.3s ease-out',
    zIndex: 1000
  },
  viewerCount: {
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '8px 15px',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  eyeIcon: {
    fontSize: '24px',
    animation: 'blink 2s infinite'
  },
  '@keyframes slideIn': {
    from: { transform: 'translateX(100%)' },
    to: { transform: 'translateX(0)' }
  },
  '@keyframes blink': {
    '0%': { opacity: 1 },
    '50%': { opacity: 0.5 },
    '100%': { opacity: 1 }
  }
};

export default React.memo(Room);