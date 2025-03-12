import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useParams, useNavigate } from 'react-router-dom';
import Whiteboard from './Whiteboard';
import Chat from './Chat';
import HandGesture from './HandGesture';

const SERVER_URL = 'https://collabboard22.onrender.com'; // Adjust as needed

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [handGestureMode, setHandGestureMode] = useState(false);
  const [gestureStatus, setGestureStatus] = useState('');

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    newSocket.emit('joinRoom', roomId);
    return () => newSocket.disconnect();
  }, [roomId]);

  const leaveRoom = () => {
    navigate('/');
  };

  const toggleHandGestureMode = () => {
    setHandGestureMode(!handGestureMode);
  };

  const handleGesture = (gesture) => {
    setGestureStatus(gesture);
    console.log('Gesture detected:', gesture);
    if (gesture === 'clear') {
      console.log('Clearing drawing...');
      socket && socket.emit('clearCanvas', { roomId });
    }
  };

  if (!socket) return <div>Connecting...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2>CollabBoard - Room: {roomId}</h2>
        <div>
          <button onClick={toggleHandGestureMode} style={styles.handGestureButton}>
            {handGestureMode ? 'Disable Hand Gesture' : 'Hand Gesture'}
          </button>
          <button onClick={leaveRoom} style={styles.leaveButton}>
            Leave Room
          </button>
        </div>
      </header>
      
      {/* ********** UPDATED CONTENT SECTION ********** */}
      <div style={styles.content}>
        {/* Always render the Whiteboard so it's visible and listening for events */}
        <div style={{ flex: 1, marginRight: '10px' }}>
          <Whiteboard socket={socket} roomId={roomId} />
        </div>

        {/* Render HandGesture only if handGestureMode is enabled */}
        {handGestureMode && (
          <div style={{ flex: 1 }}>
            <HandGesture socket={socket} roomId={roomId} onGestureDetected={handleGesture} />
          </div>
        )}

        {/* Chat on the side or below, as you prefer */}
        <div style={{ flex: 1 }}>
          <Chat socket={socket} roomId={roomId} />
        </div>
      </div>
      {/* ********************************************** */}

      {handGestureMode && (
        <div style={styles.gestureInfo}>Current Gesture: {gestureStatus}</div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#f5f5f5'
  },
  handGestureButton: {
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: '4px',
    marginRight: '10px'
  },
  leaveButton: {
    backgroundColor: '#4F81E1',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: '4px'
  },
  content: {
    display: 'flex',
    flex: 1,
    flexDirection: 'row',
    padding: '10px'
  },
  gestureInfo: {
    textAlign: 'center',
    marginTop: '5px'
  }
};

export default Room;
