import React, { useState, useEffect, useRef } from 'react';
import { useYjs } from './context/YjsContext';
import { 
  FileText, 
  Kanban, 
  Edit3, 
  Grid, 
  Users, 
  Settings, 
  Activity, 
  Wifi, 
  WifiOff,
  MessageSquare,
  Send,
  X
} from 'lucide-react';
import TextEditor from './components/TextEditor';
import KanbanBoard from './components/KanbanBoard';
import Whiteboard from './components/Whiteboard';
import Spreadsheet from './components/Spreadsheet';

function App() {
  const { 
    yDoc,
    localUser, 
    peers, 
    connected, 
    updateLocalPresence,
    setShowSetup,
    toggleConnection,
    logActivity,
    roomCode,
    setRoomCode
  } = useYjs();

  const [activeTab, setActiveTab] = useState('text');
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [checking, setChecking] = useState(false);

  // Generate a random 6-character room code and reload
  const handleCreateWorkspace = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    window.location.href = url.toString();
  };

  // Join an existing room if active on the server
  const handleJoinWorkspace = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    const code = joinCode.trim().toUpperCase();
    setChecking(true);
    setErrorMessage('');

    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const wsUrl = import.meta.env.VITE_WS_URL || (isLocal ? 'ws://localhost:1234' : 'wss://collaborative-workspace-production-1089.up.railway.app');
      const httpUrl = wsUrl.replace(/^ws/, 'http');

      const response = await fetch(`${httpUrl}/api/check-room?room=${code}`);
      const data = await response.json();

      if (data.exists) {
        // Room is active! Redirect.
        const url = new URL(window.location.href);
        url.searchParams.set('room', code);
        window.location.href = url.toString();
      } else {
        setErrorMessage('This workspace code is not active. Check the code or create a new workspace.');
      }
    } catch (err) {
      console.error('Error validating room existence:', err);
      setErrorMessage('Could not connect to the server. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  // Copy ONLY the room code to the clipboard
  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    logActivity(`copied workspace room code`);
  };

  // Feature 10: Collapsible Sidebar & Shared Chat Array
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  // Feature 6: Cursor Chat
  const [cursorChatText, setCursorChatText] = useState('');
  const [showCursorChatInput, setShowCursorChatInput] = useState(false);

  const yChat = yDoc.getArray('workspace-chat');
  const yActivity = yDoc.getArray('workspace-activity');

  // Observe global chat & activity log Yjs shared arrays
  useEffect(() => {
    if (!yDoc) return;

    const syncChat = () => setChatMessages(yChat.toArray());
    const syncActivity = () => setActivityLogs(yActivity.toArray());

    syncChat();
    syncActivity();

    yChat.observe(syncChat);
    yActivity.observe(syncActivity);

    return () => {
      yChat.unobserve(syncChat);
      yActivity.unobserve(syncActivity);
    };
  }, [yDoc, yChat, yActivity]);

  // Send a message in the activity chat sidebar
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatText.trim()) return;

    const newMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: localUser?.name || 'Anonymous',
      color: localUser?.color || '#6366f1',
      text: chatText,
      timestamp: Date.now()
    };

    yChat.push([newMessage]);
    setChatText('');
  };

  // Keyboard shortcut listener for Figma-style cursor chat
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = document.activeElement.tagName;
      const isEditable = document.activeElement.getAttribute('contenteditable') === 'true';
      
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !isEditable) {
        e.preventDefault();
        setShowCursorChatInput(true);
        setCursorChatText('');
      } else if (e.key === 'Escape') {
        setShowCursorChatInput(false);
        updateLocalPresence({ cursorChat: null });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [updateLocalPresence]);

  const handleSendCursorChat = (e) => {
    e.preventDefault();
    if (!cursorChatText.trim()) {
      setShowCursorChatInput(false);
      updateLocalPresence({ cursorChat: null });
      return;
    }

    updateLocalPresence({
      cursorChat: cursorChatText,
      cursorChatTime: Date.now(),
    });
    
    setShowCursorChatInput(false);
    
    // Auto-fade bubble after 5 seconds
    setTimeout(() => {
      updateLocalPresence({ cursorChat: null });
    }, 5000);
  };

  // Sync tab choice with Yjs Awareness presence
  useEffect(() => {
    if (localUser) {
      updateLocalPresence({ activeTab });
    }
  }, [activeTab]);

  // Toast notification useEffect hooks removed

  const renderSurface = () => {
    switch (activeTab) {
      case 'text':
        return <TextEditor />;
      case 'kanban':
        return <KanbanBoard />;
      case 'whiteboard':
        return <Whiteboard />;
      case 'spreadsheet':
        return <Spreadsheet />;
      default:
        return <TextEditor />;
    }
  };

  const getSurfaceTitle = () => {
    switch (activeTab) {
      case 'text': return 'Multiplayer Document Editor';
      case 'kanban': return 'Collaborative Kanban Flow';
      case 'whiteboard': return 'Shared Infinite Whiteboard';
      case 'spreadsheet': return 'Multi-User Spreadsheet Grid';
      default: return 'Workspace';
    }
  };

  // Render private workspace splash landing screen if no room code in URL
  if (!roomCode) {
    return (
      <div 
        className="modal-overlay" 
        style={{ 
          background: 'var(--bg-main)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: '100vh',
          width: '100vw',
          margin: 0,
          padding: 0
        }}
      >
        <div 
          className="setup-modal" 
          style={{ 
            maxWidth: '420px', 
            padding: '38px 42px', 
            boxShadow: '0 8px 30px rgba(139, 111, 78, 0.08)',
            border: '1px solid var(--border-soft)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 
              style={{ 
                fontSize: '36px', 
                fontFamily: "'Instrument Serif', Georgia, serif", 
                fontStyle: 'italic',
                fontWeight: 'normal',
                color: 'var(--accent-brown)',
                marginBottom: '8px'
              }}
            >
              Sync Suite
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              A premium, secure multiplayer workspace for text editing, sketching, organization, and calculations.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Create Workspace Option */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                onClick={handleCreateWorkspace}
                className="setup-submit-btn"
                style={{ width: '100%', padding: '12px 18px', fontSize: '14px', borderRadius: '24px', fontWeight: 600 }}
              >
                Create Private Workspace
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Generates a secure 6-character room key.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
              <div style={{ flexGrow: 1, height: '1px', background: 'var(--border-soft)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>or</span>
              <div style={{ flexGrow: 1, height: '1px', background: 'var(--border-soft)' }} />
            </div>

            {/* Join Workspace Option */}
            <form onSubmit={handleJoinWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ fontSize: '12px', fontWeight: 600, textAlign: 'center', display: 'block' }}>Enter Room Code</label>
                <input
                  type="text"
                  className="text-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g. XF8D3G"
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px', 
                    borderRadius: '24px', 
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    fontWeight: 600,
                    letterSpacing: '2px',
                    fontSize: '15px'
                  }}
                  maxLength={10}
                />
              </div>
              {errorMessage && (
                <div style={{ color: 'var(--accent-red)', fontSize: '11px', textAlign: 'center', marginTop: '4px', fontWeight: 500 }}>
                  ⚠️ {errorMessage}
                </div>
              )}
              <button 
                type="submit"
                className="setup-submit-btn"
                style={{ 
                  width: '100%', 
                  padding: '10px 18px', 
                  fontSize: '13px', 
                  borderRadius: '24px', 
                  background: 'transparent', 
                  color: 'var(--accent-brown)', 
                  border: '1px solid var(--accent-brown)' 
                }}
                disabled={!joinCode.trim() || checking}
              >
                {checking ? 'Validating Code...' : 'Join Existing Workspace'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="logo-section" style={{ paddingBottom: '16px' }}>
            <div className="logo-icon">
              <Activity size={20} color="#ffffff" />
            </div>
            <span className="logo-text">Sync Suite</span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', padding: '6px 12px', borderRadius: '6px', marginBottom: '24px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>💬 Press <strong>/</strong> to chat globally!</span>
            <span>💡 Draw & drag sketches to Kanban!</span>
          </div>

          <nav className="nav-menu">
            <button 
              className={`nav-item ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              <FileText size={18} />
              <span>Text Editor</span>
              {peers.filter(p => p.activeTab === 'text').length > 0 && (
                <span className="column-count">
                  {peers.filter(p => p.activeTab === 'text').length}
                </span>
              )}
            </button>

            <button 
              className={`nav-item ${activeTab === 'kanban' ? 'active' : ''}`}
              onClick={() => setActiveTab('kanban')}
            >
              <Kanban size={18} />
              <span>Kanban Board</span>
              {peers.filter(p => p.activeTab === 'kanban').length > 0 && (
                <span className="column-count">
                  {peers.filter(p => p.activeTab === 'kanban').length}
                </span>
              )}
            </button>

            <button 
              className={`nav-item ${activeTab === 'whiteboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('whiteboard')}
            >
              <Edit3 size={18} />
              <span>Whiteboard</span>
              {peers.filter(p => p.activeTab === 'whiteboard').length > 0 && (
                <span className="column-count">
                  {peers.filter(p => p.activeTab === 'whiteboard').length}
                </span>
              )}
            </button>

            <button 
              className={`nav-item ${activeTab === 'spreadsheet' ? 'active' : ''}`}
              onClick={() => setActiveTab('spreadsheet')}
            >
              <Grid size={18} />
              <span>Spreadsheet</span>
              {peers.filter(p => p.activeTab === 'spreadsheet').length > 0 && (
                <span className="column-count">
                  {peers.filter(p => p.activeTab === 'spreadsheet').length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Local User Profile Info Card */}
        {localUser && (
          <div className="user-profile-card">
            <div 
              className="avatar" 
              style={{ backgroundColor: localUser.color, marginLeft: 0, border: 'none', cursor: 'pointer' }}
              onClick={() => setShowSetup(true)}
              title="Edit Profile"
            >
              {localUser.name.charAt(0)}
            </div>
            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {localUser.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Active Editor
              </div>
            </div>
            <button 
              style={{ background: 'none', border: 'none', color: 'var(--text-dark)', cursor: 'pointer' }}
              onClick={() => setShowSetup(true)}
            >
              <Settings size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* Main Workspace Frame */}
      <main className="workspace-content">
        <header className="workspace-header">
          <div className="header-title-section">
            <h1 style={{ fontSize: '20px', fontWeight: 600, fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic' }}>{getSurfaceTitle()}</h1>
            <span className="surface-badge">{activeTab}</span>
          </div>

          <div className="presence-section">
            {/* Workspace Sharing Code */}
            <div 
              onClick={handleCopyShareLink}
              className="network-badge"
              style={{ 
                cursor: 'pointer',
                background: '#ffffff',
                border: '1px solid var(--border-soft)',
                borderRadius: '16px',
                height: '28px',
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                color: 'var(--text-main)',
                fontSize: '11px',
                fontWeight: 600,
                boxShadow: 'var(--shadow-small)'
              }}
              title="Click to copy invite link"
            >
              <Users size={12} color="var(--accent-brown)" />
              <span>Workspace: <strong>{roomCode}</strong></span>
              <span style={{ fontSize: '10px', color: copied ? '#6b8f71' : 'var(--text-muted)' }}>
                {copied ? 'Copied!' : '(Copy)'}
              </span>
            </div>

            {/* Connection Indicator */}
            <div className="network-badge" style={{ cursor: 'pointer' }} onClick={toggleConnection} title="Click to toggle offline mode">
              <span className={`network-dot ${connected ? '' : 'disconnected'}`}></span>
              <span>{connected ? 'Live Syncing' : 'Offline'}</span>
            </div>
            
            <button 
              className="wb-tool-btn"
              style={{ width: 'auto', padding: '0 12px', borderRadius: '16px', fontSize: '11px', height: '28px', backgroundColor: connected ? 'rgba(196, 92, 79, 0.08)' : 'rgba(107, 143, 113, 0.08)', color: connected ? '#c45c4f' : '#6b8f71', border: '1px solid currentColor' }}
              onClick={toggleConnection}
            >
              {connected ? 'Disconnect' : 'Connect'}
            </button>

            {/* Activity/Chat Drawer Toggle */}
            <button 
              className="wb-tool-btn" 
              onClick={() => setSidebarOpen(prev => !prev)}
              title="Activity Feed & Chat"
              style={{ color: sidebarOpen ? 'var(--accent-brown)' : 'var(--text-muted)', background: sidebarOpen ? 'rgba(139, 111, 78, 0.08)' : 'transparent', border: '1px solid var(--border-soft)' }}
            >
              <MessageSquare size={16} />
            </button>

            {/* Active Members Stack */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {peers.length + 1} online:
              </span>
              <div className="avatars-stack">
                {/* Local User Avatar */}
                {localUser && (
                  <div className="avatar" style={{ backgroundColor: localUser.color }}>
                    {localUser.name.charAt(0)}
                    <span className="avatar-tooltip">{localUser.name} (You)</span>
                    {localUser.cursorChat && (
                      <div 
                        className="cursor-chat-bubble" 
                        style={{ 
                          backgroundColor: localUser.color,
                          border: '1px solid rgba(255,255,255,0.15)',
                          top: '42px',
                          left: '50%',
                          transform: 'translateX(-50%)'
                        }}
                      >
                        {localUser.cursorChat}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Peer Avatars */}
                {peers.map((peer, idx) => (
                  <div 
                    key={peer.clientId || idx} 
                    className="avatar" 
                    style={{ backgroundColor: peer.color }}
                  >
                    {peer.name.charAt(0)}
                    <span className="avatar-tooltip">
                      {peer.name} {peer.activeTab ? `[on ${peer.activeTab}]` : ''}
                    </span>
                    {peer.cursorChat && (
                      <div 
                        className="cursor-chat-bubble" 
                        style={{ 
                          backgroundColor: peer.color,
                          border: '1px solid rgba(255,255,255,0.15)',
                          top: '42px',
                          left: '50%',
                          transform: 'translateX(-50%)'
                        }}
                      >
                        {peer.cursorChat}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Render Tab Workspace */}
        <section className="surface-view">
          {renderSurface()}
        </section>
      </main>

      {/* Real-time Join/Leave Notifications Removed */}

      {/* Feature 10: Collapsible Workspace Sidebar Panel */}
      <aside className={`activity-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="activity-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={18} color="var(--accent-brown)" />
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Workspace Feed</h2>
          </div>
          <button className="wb-tool-btn" onClick={() => setSidebarOpen(false)} style={{ width: '28px', height: '28px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="activity-content">
          {/* Shared Chat Section */}
          <div className="activity-chat-section">
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Live Group Chat</h3>
            <div className="chat-messages-container">
              {chatMessages.length === 0 ? (
                <div style={{ fontStyle: 'italic', color: 'var(--text-dark)', fontSize: '12px', textAlign: 'center', margin: 'auto' }}>
                  No messages yet.
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isLocal = msg.sender === localUser?.name;
                  return (
                    <div 
                      key={msg.id} 
                      className={`chat-bubble ${isLocal ? 'local' : 'remote'}`}
                    >
                      <div style={{ fontSize: '9px', opacity: 0.7, fontWeight: 700, marginBottom: '2px', color: isLocal ? '#fff' : msg.color }}>
                        {msg.sender}
                      </div>
                      <div>{msg.text}</div>
                    </div>
                  );
                })
              )}
            </div>
            <form onSubmit={handleSendChat} className="chat-input-wrapper" style={{ marginTop: '8px' }}>
              <input
                type="text"
                className="text-input"
                style={{ flexGrow: 1, padding: '8px 12px', fontSize: '13px' }}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Type chat message..."
              />
              <button type="submit" className="setup-submit-btn" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none' }}>
                <Send size={14} />
              </button>
            </form>
          </div>

          <div className="wb-divider" style={{ width: '100%', height: '1px' }} />

          {/* Activity Log Section */}
          <div className="activity-log-section">
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Shared Activity Log</h3>
            <div className="log-list" style={{ maxHeight: '180px' }}>
              {activityLogs.length === 0 ? (
                <div style={{ fontStyle: 'italic', color: 'var(--text-dark)', fontSize: '12px', textAlign: 'center', margin: '8px 0' }}>
                  No activity recorded yet.
                </div>
              ) : (
                activityLogs.slice().reverse().map((log) => (
                  <div key={log.id} className="log-item" style={{ borderLeftColor: log.color, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{log.user}</span> {log.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Feature 6: Figma-style Cursor Chat Floating Input overlay */}
      {showCursorChatInput && (
        <div 
          style={{ 
            position: 'fixed', 
            bottom: '100px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            zIndex: 9999, 
            background: '#ffffff', 
            border: '1px solid var(--border-soft)', 
            borderRadius: '20px', 
            padding: '8px 16px', 
            boxShadow: 'var(--shadow-lifted)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Cursor Chat:</span>
          <form onSubmit={handleSendCursorChat}>
            <input
              type="text"
              className="text-input"
              style={{ padding: '6px 12px', fontSize: '13px', width: '220px', border: 'none', background: 'rgba(0,0,0,0.02)' }}
              value={cursorChatText}
              onChange={(e) => setCursorChatText(e.target.value)}
              placeholder="Say something... (Enter)"
              autoFocus
            />
          </form>
          <button 
            className="wb-tool-btn" 
            style={{ width: '22px', height: '22px' }} 
            onClick={() => { setShowCursorChatInput(false); updateLocalPresence({ cursorChat: null }); }}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
