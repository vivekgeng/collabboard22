import React, { useEffect, useState, useCallback } from "react";
import io from "socket.io-client";
import { useParams, useNavigate } from "react-router-dom";
import Whiteboard from "./Whiteboard";
import Chat from "./Chat";
import HandGesture from "./HandGesture";

const SERVER_URL = "http://localhost:5000/";

const Popup = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed  top-4 left-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg">
      {message}
    </div>
  );
};

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [totalUsers, setTotalUsers] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [socket, setSocket] = useState(null);
  const [localId, setLocalId] = useState(null);
  const [handGestureMode, setHandGestureMode] = useState(false);
  const [gestureStatus, setGestureStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ["websocket"],
      upgrade: false,
      reconnectionAttempts: 3,
      timeout: 5000,
    });

    const connectionTimer = setTimeout(() => {
      if (!newSocket.connected) {
        setConnectionError(true);
        setLoading(false);
      }
    }, 10000);

    newSocket.on("connect", () => {
      clearTimeout(connectionTimer);
      setLocalId(newSocket.id);
      setLoading(false);
      setConnectionError(false);
    });

    newSocket.on("totalUsers", (data) => {
      setTotalUsers(data.totalUsers);
      setShowPopup(true); // Show popup when a new user joins
    });

    newSocket.on("connect_error", () => {
      setConnectionError(true);
      setLoading(false);
    });

    newSocket.emit("joinRoom", roomId);
    setSocket(newSocket);

    return () => {
      clearTimeout(connectionTimer);
      newSocket.disconnect();
    };
  }, [roomId]);

  const leaveRoom = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const toggleHandGestureMode = useCallback(() => {
    setHandGestureMode((prev) => !prev);
  }, []);

  const handleGesture = useCallback(
    (gesture) => {
      setGestureStatus(gesture);
      if (gesture === "clear" && socket) {
        socket.emit("clearCanvas", { roomId, senderId: localId });
      }
    },
    [socket, roomId, localId]
  );

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h2 className="text-red-600 text-xl">Connection Failed</h2>
        <p>Unable to connect to the server. Please try again later.</p>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded-md mt-4"
          onClick={() => window.location.reload()}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        <p>Connecting to room {roomId}...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="flex justify-between items-center p-4 bg-white shadow-md">
        <h1 className="text-lg font-bold text-gray-700">CollabAI - Room: {roomId} ({totalUsers} users)</h1>
        <div className="flex space-x-2">
          <button
            onClick={toggleHandGestureMode}
            className={`px-4 py-2 rounded-md ${
              handGestureMode ? "bg-red-500 text-white" : "bg-green-500 text-white"
            }`}
          >
            {handGestureMode ? "✋ Disable Gestures" : "👆 Hand Gestures"}
          </button>
          <button onClick={leaveRoom} className="bg-blue-500 text-white px-4 py-2 rounded-md">
            🚪 Leave Room
          </button>
        </div>
      </header>

      <div className="flex flex-1 p-4">
        <div className="flex-1 bg-white rounded-lg shadow-md p-4">
          <Whiteboard socket={socket} roomId={roomId} localId={localId} onActivePageChange={setActivePage} />
        </div>

        {handGestureMode && (
          <div className="ml-4 w-1/4 bg-white rounded-lg shadow-md p-4">
            <HandGesture
              socket={socket}
              roomId={roomId}
              activePage={activePage}
              onGestureDetected={handleGesture}
              localId={localId}
              color="#FF0000"
              lineWidth={2}
            />
            <div className="mt-2 p-2 bg-gray-200 text-center rounded-md">
              Active Gesture: <strong>{gestureStatus || "None"}</strong>
            </div>
          </div>
        )}

        <div className="ml-4 w-1/4 bg-white rounded-lg shadow-md p-4">
          <Chat socket={socket} roomId={roomId} />
        </div>
      </div>

      {showPopup && <Popup message=" User joined!" onClose={() => setShowPopup(false)} />}
    </div>
  );
}

export default React.memo(Room);
