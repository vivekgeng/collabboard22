import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = () => {
    if (roomId.trim() !== '') {
      navigate(`/room/${roomId}`);
    }
  };

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newRoomId}`);
  };

  return (
    <div style={styles.container}>
      <h1>Welcome to CollabBoard</h1>
      <p>Join or create collaboration rooms to start working with your team.</p>
      <div style={styles.joinContainer}>
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleJoinRoom} style={styles.joinButton}>Join</button>
      </div>
      <button onClick={handleCreateRoom} style={styles.createButton}>
        Create a New Room
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginTop: '50px'
  },
  joinContainer: {
    display: 'flex', flexDirection: 'row', alignItems: 'center',
    margin: '20px'
  },
  input: {
    padding: '10px', fontSize: '16px', marginRight: '10px'
  },
  joinButton: {
    padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
    backgroundColor: '#4F81E1', color: '#fff', border: 'none', borderRadius: '4px'
  },
  createButton: {
    padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
    backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '4px'
  }
};

export default Home;