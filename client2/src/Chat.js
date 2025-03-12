import React, { useState, useEffect } from 'react';

function Chat({ socket, roomId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    // Listen for incoming chat messages
    socket.on('chatMessage', (msgData) => {
      setMessages((prev) => [...prev, msgData]);
    });

    return () => {
      socket.off('chatMessage');
    };
  }, [socket]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const msgData = {
      roomId,
      username: username || 'Anonymous',
      message: input,
      time: new Date().toLocaleTimeString()
    };
    socket.emit('chatMessage', msgData);
    // Also add to our own chat
    setMessages((prev) => [...prev, msgData]);
    setInput('');
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.participants}>
        <h3>Chat</h3>
        <label style={{ fontSize: '14px' }}>Your Name:</label>
        <input
          style={styles.nameInput}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your name"
        />
      </div>
      <div style={styles.messages}>
        {messages.map((msg, idx) => (
          <div key={idx} style={styles.message}>
            <strong>{msg.username}:</strong> {msg.message}
            <div style={styles.time}>{msg.time}</div>
          </div>
        ))}
      </div>
      <div style={styles.inputContainer}>
        <input
          style={styles.textInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
        />
        <button style={styles.sendButton} onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

const styles = {
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '0 10px'
  },
  participants: {
    backgroundColor: '#f5f5f5',
    padding: '10px'
  },
  nameInput: {
    width: '100%',
    padding: '6px',
    marginTop: '5px'
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    margin: '10px 0',
    border: '1px solid #ccc',
    padding: '10px'
  },
  message: {
    marginBottom: '10px'
  },
  time: {
    fontSize: '10px',
    color: '#999'
  },
  inputContainer: {
    display: 'flex',
    marginBottom: '10px'
  },
  textInput: {
    flex: 1,
    padding: '10px',
    fontSize: '16px'
  },
  sendButton: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#4F81E1',
    color: '#fff',
    border: 'none',
    cursor: 'pointer'
  }
};

export default Chat;
