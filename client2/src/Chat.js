import React, { useState, useEffect, useRef } from 'react';

function Chat({ socket, roomId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleChatMessage = (msgData) => {
      // Prevent duplicate messages using unique timestamp
      setMessages(prev => {
        const exists = prev.some(msg => 
          msg.timestamp === msgData.timestamp && 
          msg.senderId === msgData.senderId
        );
        return exists ? prev : [...prev, msgData];
      });
    };

    socket.on('chatMessage', handleChatMessage);
    return () => {
      socket.off('chatMessage', handleChatMessage);
    };
  }, [socket]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const msgData = {
      roomId,
      username: username || 'Anonymous',
      message: input,
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),  // Unique identifier
      senderId: socket.id     // Add sender ID to prevent duplicates
    };
    
    socket.emit('chatMessage', msgData);
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
          <div key={`${msg.timestamp}-${msg.senderId}`} style={styles.message}>
            <strong>{msg.username}:</strong> {msg.message}
            <div style={styles.time}>{msg.time}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
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

// Updated styles with improved scrolling
const styles = {
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%', // Ensure container takes full height
    padding: '0 10px'
  },
  participants: {
    backgroundColor: '#f5f5f5',
    padding: '10px',
    flexShrink: 0 // Prevent shrinking
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
    padding: '10px',
    minHeight: 0 // Crucial for flex scrolling
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
    marginBottom: '10px',
    flexShrink: 0 // Keep input fixed at bottom
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