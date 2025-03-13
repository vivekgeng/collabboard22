// Room.js
import React, { useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { useParams, useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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
  const [participantsCount, setParticipantsCount] = useState(1);

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
      upgrade: false,
      reconnectionAttempts: 3,
      timeout: 5000
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
    });

    newSocket.on('connect_error', () => {
      setConnectionError(true);
      setLoading(false);
    });

    newSocket.on('userActivity', (data) => {
      setParticipantsCount(data.count);
      toast.info(data.message, {
        autoClose: 3000,
        hideProgressBar: true
      });
    });

    newSocket.on('roomStatus', (data) => {
      setParticipantsCount(data.participants);
    });

    newSocket.emit('joinRoom', roomId);
    setSocket(newSocket);

    return () => {
      clearTimeout(connectionTimer);
      newSocket.disconnect();
    };
  }, [roomId]);

  const leaveRoom = useCallback(() => {
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
      <ToastContainer
        position="bottom-right"
        newestOnTop
        closeButton={false}
      />
      
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>CollabBoard - Room: {roomId}</h1>
          <div style={styles.participantCounter}>
            👥 {participantsCount} active participants
          </div>
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
  participantCounter: {
    backgroundColor: '#4F81E1',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '0.9rem',
    marginTop: '0.5rem'
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
  }
};

export default React.memo(Room);