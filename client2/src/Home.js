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
    <div style={styles.container } className='overflow-hidden max-h-screen w-full' >
       <div className="fixed inset-0 bg-gradient-to-br from-blue-500/30 to-red-800 backdrop-blur-xl"></div>
     
      <div className="relative z-10 text-white text-3xl font-bold ">
      <div  className='relative h-screen w-screen flex items-center justify-center flex-col '>  
      <h1>Welcome to CollabAI</h1>
      <p className=' text-siz'>Join or create collaboration rooms to start working with your team.</p>
      <div style={styles.joinContainer} className=' space-x-2 '>
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
         className=" overflow-hidden w-full px-2 py-2 rounded-lg bg-white/10 backdrop-blur-md text-white placeholder-white/60 shadow-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
        />

        <button onClick={handleJoinRoom}  className='px-6 py-3 rounded-lg bg-white/10 backdrop-blur-md text-white font-semibold shadow-lg hover:bg-white/20 transition-all'>Join</button>
      </div>
      <button onClick={handleCreateRoom}  className='px-6 py-3 rounded-lg bg-white/10 backdrop-blur-md text-white font-semibold shadow-lg hover:bg-white/20 transition-all'>
        Create a New Room
      </button>
      </div>
      </div>

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