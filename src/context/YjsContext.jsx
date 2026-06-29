import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const YjsContext = createContext(null);

const ADJECTIVES = ['Creative', 'Coding', 'Swift', 'Bright', 'Clever', 'Aero', 'Vibe', 'Hyper', 'Nova', 'Solar'];
const NOUNS = ['Otter', 'Fox', 'Puma', 'Koala', 'Falcon', 'Beaver', 'Badger', 'Lynx', 'Orion', 'Matrix'];
const COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#10b981', // Emerald
  '#3b82f6', // Blue
];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const YjsProvider = ({ children }) => {
  const [yDoc] = useState(() => {
    const doc = new Y.Doc();
    // Do NOT store clientID in sessionStorage to prevent duplicate clientID conflicts when tabs are duplicated.
    // Let Yjs automatically generate a unique 32-bit unsigned integer clientID on creation.
    return doc;
  });
  const [provider, setProvider] = useState(null);
  const [connected, setConnected] = useState(false);
  const [localUser, setLocalUser] = useState(null);
  const [peers, setPeers] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.toUpperCase() || '';
  });

  // Initialize Local User Profile (only if roomCode is active)
  useEffect(() => {
    if (!roomCode) return;

    const savedName = sessionStorage.getItem('sync_suite_username');
    const savedColor = sessionStorage.getItem('sync_suite_usercolor');

    if (savedName && savedColor) {
      setLocalUser({ name: savedName, color: savedColor, activeTab: 'text' });
    } else {
      const randomName = `${getRandomItem(ADJECTIVES)} ${getRandomItem(NOUNS)}`;
      const randomColor = getRandomItem(COLORS);
      const user = { name: randomName, color: randomColor, activeTab: 'text' };
      setLocalUser(user);
      sessionStorage.setItem('sync_suite_username', randomName);
      sessionStorage.setItem('sync_suite_usercolor', randomColor);
      setShowSetup(true); // Pop up profile selection modal
    }
  }, [roomCode]);

  // Initialize WebSocket connection ONCE when roomCode is active
  useEffect(() => {
    if (!roomCode) return;

    // Dynamically choose between local WebSocket server and Yjs public demo server for deployment
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsUrl = import.meta.env.VITE_WS_URL || (isLocal ? 'ws://localhost:1234' : 'wss://collaborative-workspace-production-1089.up.railway.app');
    const roomName = `sync-suite-room-${roomCode}`;

    const wsProvider = new WebsocketProvider(wsUrl, roomName, yDoc);

    setProvider(wsProvider);

    // Sync Connection Status
    wsProvider.on('status', (event) => {
      setConnected(event.status === 'connected');
    });

    // Configure local awareness
    const awareness = wsProvider.awareness;

    // Track Remote Peers
    const updatePresence = () => {
      const states = Array.from(awareness.getStates().entries());
      const activePeers = states
        .filter(([clientId]) => clientId !== yDoc.clientID)
        .map(([clientId, state]) => ({
          clientId,
          ...state.user,
        }))
        .filter((peer) => peer.name); // only count peers that have a name

      setPeers(activePeers);
    };

    awareness.on('change', updatePresence);
    updatePresence();

    const handleBeforeUnload = () => {
      // Disconnect WebSocket immediately to notify peers without waiting for server timeouts
      wsProvider.disconnect();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      wsProvider.disconnect();
      wsProvider.destroy();
      setConnected(false);
      setProvider(null);
    };
  }, [roomCode, yDoc]);

  // Set initial awareness state once provider is ready and localUser is loaded
  useEffect(() => {
    if (!provider || !localUser) return;
    const awareness = provider.awareness;
    const current = awareness.getLocalState()?.user;
    
    if (!current || !current.name) {
      awareness.setLocalStateField('user', {
        name: localUser.name,
        color: localUser.color,
        activeTab: localUser.activeTab,
        cursor: null,
        selectedCell: null,
      });
    }
  }, [provider, localUser?.name, localUser?.color]);

  // Update local user's presence state fields (optimized to bypass React shell state updates on transient cursor moves)
  const updateLocalPresence = (fields) => {
    if (!provider) return;
    const awareness = provider.awareness;
    const currentUserState = awareness.getLocalState()?.user || {};
    const updatedUser = { ...currentUserState, ...fields };
    
    // Send updates directly via Yjs awareness
    awareness.setLocalStateField('user', updatedUser);
    
    // Only update React state for persistent profile metadata to prevent shell re-renders on cursor moves
    if (fields.name !== undefined || fields.color !== undefined || fields.activeTab !== undefined) {
      setLocalUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(fields.name !== undefined && { name: fields.name }),
          ...(fields.color !== undefined && { color: fields.color }),
          ...(fields.activeTab !== undefined && { activeTab: fields.activeTab }),
        };
      });
    }
  };
  const logActivity = (text) => {
    if (!yDoc) return;
    const yActivity = yDoc.getArray('workspace-activity');
    const logItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: localUser?.name || 'Anonymous',
      color: localUser?.color || '#6366f1',
      text,
      timestamp: Date.now()
    };
    yDoc.transact(() => {
      yActivity.push([logItem]);
      if (yActivity.length > 30) {
        yActivity.delete(0, yActivity.length - 30);
      }
    });
  };

  const toggleConnection = () => {
    if (!provider) return;
    if (connected) {
      provider.disconnect();
    } else {
      provider.connect();
    }
  };

  const handleSaveSetup = (name, color) => {
    sessionStorage.setItem('sync_suite_username', name);
    sessionStorage.setItem('sync_suite_usercolor', color);
    updateLocalPresence({ name, color });
    setShowSetup(false);
  };

  return (
    <YjsContext.Provider
      value={{
        yDoc,
        provider,
        connected,
        localUser,
        peers,
        updateLocalPresence,
        showSetup,
        setShowSetup,
        handleSaveSetup,
        toggleConnection,
        logActivity,
        COLORS,
        roomCode,
        setRoomCode
      }}
    >
      {children}
      
      {showSetup && localUser && (
        <div className="modal-overlay">
          <div className="setup-modal">
            <h2 className="modal-title">Welcome to Sync Suite</h2>
            <p className="modal-desc">
              Choose your profile nickname and theme color for real-time multiplayer collab.
            </p>
            <div className="input-group">
              <label className="input-label">Your Nickname</label>
              <input
                type="text"
                className="text-input"
                value={localUser.name}
                onChange={(e) => setLocalUser(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter nickname"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Avatar Color</label>
              <div className="color-picker-grid">
                {COLORS.map((c) => (
                  <div
                    key={c}
                    className={`color-dot ${localUser.color === c ? 'active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setLocalUser(prev => ({ ...prev, color: c }))}
                  />
                ))}
              </div>
            </div>
            <button
              className="setup-submit-btn"
              onClick={() => handleSaveSetup(localUser.name, localUser.color)}
            >
              Enter Workspace
            </button>
          </div>
        </div>
      )}
    </YjsContext.Provider>
  );
};

export const useYjs = () => {
  const context = useContext(YjsContext);
  if (!context) {
    throw new Error('useYjs must be used within a YjsProvider');
  }
  return context;
};
