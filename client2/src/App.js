import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route
} from 'react-router-dom';
import Home from './Home';
import Room from './Room';
import Appy from './Appy';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Appy />} />
        <Route path="/room" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </Router>
  );
}

export default App;