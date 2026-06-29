import React, { useEffect, useState, useRef } from 'react';
import { useYjs } from '../context/YjsContext';
import { FileText, Download, Undo2, Redo2, Eye, EyeOff } from 'lucide-react';
import * as Y from 'yjs';

const TextEditor = () => {
  const { yDoc, provider, localUser, peers, updateLocalPresence, logActivity } = useYjs();
  const [text, setText] = useState('');
  const [activeTypers, setActiveTypers] = useState([]);
  const textareaRef = useRef(null);
  const replicaRef = useRef(null);
  const [cursorCoords, setCursorCoords] = useState({});

  const yText = yDoc.getText('text-content');
  const [undoManager, setUndoManager] = useState(null);
  const [mode, setMode] = useState('edit'); // 'edit' or 'preview'

  // Custom markdown parser for rendering
  const parseMarkdown = (md) => {
    if (!md) return '<p style="color: var(--text-dark); font-style: italic;">Nothing to preview yet. Start typing on Write tab...</p>';
    const escaped = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    let html = '';
    const lines = escaped.split('\n');
    let inCodeBlock = false;
    let codeContent = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          html += `<pre><code>${codeContent.join('\n')}</code></pre>\n`;
          codeContent = [];
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        html += `<h1>${line.substring(2)}</h1>\n`;
        continue;
      }
      if (line.startsWith('## ')) {
        html += `<h2>${line.substring(3)}</h2>\n`;
        continue;
      }
      if (line.startsWith('### ')) {
        html += `<h3>${line.substring(4)}</h3>\n`;
        continue;
      }

      // Blockquotes
      if (line.startsWith('&gt; ')) {
        html += `<blockquote>${line.substring(5)}</blockquote>\n`;
        continue;
      }

      // Lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) {
          inList = true;
          html += '<ul>\n';
        }
        html += `<li>${line.substring(2)}</li>\n`;
        continue;
      } else {
        if (inList) {
          inList = false;
          html += '</ul>\n';
        }
      }

      // Inline styles (bold, italic, inline code)
      let formattedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');

      if (line.trim() === '') {
        html += '<br/>\n';
      } else {
        html += `<p>${formattedLine}</p>\n`;
      }
    }

    if (inList) html += '</ul>\n';
    return html;
  };

  // Initialize Y.UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(yText);
    setUndoManager(um);
    return () => um.destroy();
  }, [yText]);

  // Bind Ctrl+Z / Ctrl+Y keyboard shortcuts
  useEffect(() => {
    if (!undoManager) return;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'z') {
          e.preventDefault();
          undoManager.undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          undoManager.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoManager]);

  // Sync Yjs text changes to state
  useEffect(() => {
    // Initial load
    setText(yText.toString());

    const handleObserve = (event) => {
      // Ignore local keystrokes to prevent cursor jumps and glitches
      if (event.transaction.local) return;

      // Save cursor position
      const textarea = textareaRef.current;
      if (!textarea) {
        setText(yText.toString());
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Update text state
      setText(yText.toString());

      // Restore cursor position adjusting for diffs
      // Yjs handles the actual content merge, we just restore cursor
      setTimeout(() => {
        if (textarea) {
          textarea.setSelectionRange(start, end);
        }
      }, 0);
    };

    yText.observe(handleObserve);
    return () => {
      yText.unobserve(handleObserve);
    };
  }, [yText]);

  // Diffing algorithm to apply local changes to Y.Text
  const handleInputChange = (e) => {
    const textarea = e.target;
    const newValue = textarea.value;
    const oldValue = yText.toString();

    // Calculate common prefix
    let commonPrefixLen = 0;
    while (
      commonPrefixLen < oldValue.length &&
      commonPrefixLen < newValue.length &&
      oldValue[commonPrefixLen] === newValue[commonPrefixLen]
    ) {
      commonPrefixLen++;
    }

    // Calculate common suffix
    let commonSuffixLen = 0;
    while (
      commonSuffixLen < oldValue.length - commonPrefixLen &&
      commonSuffixLen < newValue.length - commonPrefixLen &&
      oldValue[oldValue.length - 1 - commonSuffixLen] === newValue[newValue.length - 1 - commonSuffixLen]
    ) {
      commonSuffixLen++;
    }

    const deleteCount = oldValue.length - commonPrefixLen - commonSuffixLen;
    const insertText = newValue.slice(commonPrefixLen, newValue.length - commonSuffixLen);

    yDoc.transact(() => {
      if (deleteCount > 0) {
        yText.delete(commonPrefixLen, deleteCount);
      }
      if (insertText.length > 0) {
        yText.insert(commonPrefixLen, insertText);
      }
    });

    setText(newValue);
    updateCursorPresence();
  };

  // Sync Local Cursor to Awareness
  const updateCursorPresence = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    updateLocalPresence({
      cursor: {
        index: start,
        isSelecting: start !== end,
      },
    });
    calculateCursorCoordinates();
  };

  // Calculate pixel coordinates for cursors (for overlay rendering)
  const calculateCursorCoordinates = () => {
    const textarea = textareaRef.current;
    const replica = replicaRef.current;
    if (!textarea || !replica) return;

    const selectionStart = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, selectionStart);

    // Replicate textarea properties to invisible div
    const styles = window.getComputedStyle(textarea);
    replica.style.font = styles.font;
    replica.style.lineHeight = styles.lineHeight;
    replica.style.padding = styles.padding;
    replica.style.border = styles.border;
    replica.style.width = styles.width;
    replica.style.height = styles.height;
    replica.style.whiteSpace = 'pre-wrap';
    replica.style.wordBreak = 'break-word';

    // Set text up to cursor with a marker span
    replica.innerHTML = '';
    const textNode = document.createTextNode(textBeforeCursor);
    replica.appendChild(textNode);

    const marker = document.createElement('span');
    marker.textContent = '|';
    marker.style.color = 'transparent';
    replica.appendChild(marker);

    // Get position of marker relative to replica container
    setTimeout(() => {
      if (marker.parentNode) {
        const rect = marker.getBoundingClientRect();
        const parentRect = replica.getBoundingClientRect();
        
        setCursorCoords({
          top: marker.offsetTop - textarea.scrollTop,
          left: marker.offsetLeft,
        });
      }
    }, 0);
  };

  // Update active typers list based on peers in the same tab
  useEffect(() => {
    const textPeers = peers.filter(p => p.activeTab === 'text');
    setActiveTypers(textPeers);
  }, [peers]);

  // Export Document to Markdown file
  const handleExport = () => {
    const element = document.createElement('a');
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = 'sync-suite-document.md';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    logActivity("exported the Markdown document");
  };

  return (
    <div className="editor-container">
      {/* Editor Toolbar */}
      <div className="editor-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 600 }}>
          <FileText size={16} color="var(--accent-brown)" />
          <span>document.md</span>
        </div>
        <div className="wb-divider" />
        <div className="tool-group">
          <button onClick={() => undoManager?.undo()} title="Undo (Ctrl+Z)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
            <Undo2 size={13} />
          </button>
          <button onClick={() => undoManager?.redo()} title="Redo (Ctrl+Y)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
            <Redo2 size={13} />
          </button>
        </div>
        <div className="wb-divider" />
        
        {/* Toggle Mode */}
        <div className="tool-group">
          <button 
            className={`wb-tool-btn ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => setMode('edit')}
            title="Write Mode"
            style={{ width: '28px', height: '28px' }}
          >
            <EyeOff size={13} />
          </button>
          <button 
            className={`wb-tool-btn ${mode === 'preview' ? 'active' : ''}`}
            onClick={() => setMode('preview')}
            title="Preview Mode"
            style={{ width: '28px', height: '28px' }}
          >
            <Eye size={13} />
          </button>
        </div>
        
        <div style={{ flexGrow: 1 }} />
        
        <button onClick={handleExport} title="Download Markdown" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-glass)', padding: '6px 12px', borderRadius: 'var(--button-radius)', cursor: 'pointer' }}>
          <Download size={14} />
          <span>Export</span>
        </button>
      </div>

      {/* Editor Main Content */}
      <div className="editor-textarea-wrapper">
        {/* Invisible replica for cursor coordinate calculations */}
        <div 
          ref={replicaRef} 
          style={{ 
            position: 'absolute', 
            visibility: 'hidden', 
            pointerEvents: 'none', 
            top: 24, 
            left: 24,
            zIndex: -1 
          }}
        />

        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            className="collab-editor"
            value={text}
            onChange={handleInputChange}
            onKeyUp={updateCursorPresence}
            onSelect={updateCursorPresence}
            onScroll={calculateCursorCoordinates}
            onFocus={updateCursorPresence}
            placeholder="Start vibecoding or typing notes here..."
            spellCheck={false}
            style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 250px)', resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '15px', fontFamily: 'monospace', lineHeight: 1.6 }}
          />
        ) : (
          <div 
            className="markdown-preview" 
            dangerouslySetInnerHTML={{ __html: parseMarkdown(text) }} 
          />
        )}

        {/* Remote Cursors Overlay */}
        {mode === 'edit' && activeTypers.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 5,
            pointerEvents: 'none'
          }}>
            {activeTypers.map((peer, idx) => {
              const peerCursor = peer.cursor;
              if (!peerCursor) return null;

              return (
                <div 
                  key={peer.clientId || idx} 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: `${peer.color}15`,
                    border: `1px solid ${peer.color}`,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    animation: 'pulse-glow 1.5s infinite alternate'
                  }}
                >
                  <span className="column-dot" style={{ backgroundColor: peer.color, width: '6px', height: '6px' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{peer.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TextEditor;
