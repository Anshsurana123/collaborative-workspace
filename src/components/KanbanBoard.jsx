import React, { useEffect, useState, useRef } from 'react';
import { useYjs } from '../context/YjsContext';
import { Plus, Trash2, Edit2, Check, X, Undo2, Redo2 } from 'lucide-react';
import * as Y from 'yjs';

// Renders a miniature version of the whiteboard sketch inside a Kanban card
const SketchThumbnail = ({ strokes }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes || strokes.length === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Bounding Box to center/scale sketch inside the thumbnail card
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    strokes.forEach(stroke => {
      if (!stroke.points) return;
      stroke.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const sketchW = maxX - minX;
    const sketchH = maxY - minY;
    
    const padding = 6;
    const availW = canvas.width - padding * 2;
    const availH = canvas.height - padding * 2;
    
    const scale = Math.min(availW / (sketchW || 1), availH / (sketchH || 1), 1);
    
    strokes.forEach(stroke => {
      if (!stroke.points || stroke.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(1.5, stroke.width * scale * 0.8);
      
      const firstPoint = stroke.points[0];
      const startX = padding + (firstPoint.x - minX) * scale;
      const startY = padding + (firstPoint.y - minY) * scale;
      ctx.moveTo(startX, startY);
      
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        const nextX = padding + (point.x - minX) * scale;
        const nextY = padding + (point.y - minY) * scale;
        ctx.lineTo(nextX, nextY);
      }
      ctx.stroke();
    });
  }, [strokes]);

  return (
    <canvas 
      ref={canvasRef} 
      width={260} 
      height={100} 
      style={{ 
        width: '100%', 
        height: '100px', 
        backgroundColor: 'rgba(0, 0, 0, 0.25)', 
        borderRadius: '6px', 
        marginTop: '8px',
        display: 'block' 
      }} 
    />
  );
};

const DEFAULT_COLUMNS = [
  { id: 'todo', name: 'To Do', color: '#8b6f4e' },
  { id: 'in-progress', name: 'In Progress', color: '#8b7bb5' },
  { id: 'review', name: 'In Review', color: '#6b8f71' },
  { id: 'done', name: 'Done', color: '#c4956a' }
];

const COLUMN_COLORS = ['#8b6f4e', '#8b7bb5', '#6b8f71', '#c4956a', '#c45c4f', '#5b8dbf', '#e8a840', '#c07a5a'];

const KanbanBoard = () => {
  const { yDoc, peers, localUser, logActivity } = useYjs();
  const [cards, setCards] = useState({});
  const [columns, setColumns] = useState(() => {
    const saved = localStorage.getItem('sync-suite-kanban-columns');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [editingCardId, setEditingCardId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editTag, setEditTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [colToDelete, setColToDelete] = useState(null);

  const yCards = yDoc.getMap('kanban-cards');
  const [undoManager, setUndoManager] = useState(null);

  // Initialize Y.UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(yCards);
    setUndoManager(um);
    return () => um.destroy();
  }, [yCards]);

  // Bind keyboard shortcuts
  useEffect(() => {
    if (!undoManager) return;

    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

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

  // Load and observe changes in Kanban cards map
  useEffect(() => {
    setCards(yCards.toJSON());

    const handleObserve = () => {
      setCards(yCards.toJSON());
    };

    yCards.observe(handleObserve);
    return () => {
      yCards.unobserve(handleObserve);
    };
  }, [yCards]);

  // Create a new card
  const handleAddCard = (columnId) => {
    const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newCard = {
      id: cardId,
      content: 'New task card - double click to edit',
      columnId,
      color: '',
      tag: '',
      createdAt: Date.now(),
      createdBy: localUser?.name || 'Anonymous'
    };
    yCards.set(cardId, newCard);
    logActivity(`added a card to "${columns.find(c => c.id === columnId)?.name || columnId}"`);
  };

  // Delete a card
  const handleDeleteCard = (cardId) => {
    const card = yCards.get(cardId);
    yCards.delete(cardId);
    logActivity(`deleted a card: "${card?.content?.substring(0, 15)}..."`);
  };

  // Start editing a card
  const handleStartEdit = (cardId, card) => {
    setEditingCardId(cardId);
    setEditContent(card.content || '');
    setEditColor(card.color || '');
    setEditTag(card.tag || '');
  };

  // Save card edits
  const handleSaveEdit = (cardId) => {
    if (!editContent.trim()) return;
    const card = yCards.get(cardId);
    if (card) {
      yCards.set(cardId, {
        ...card,
        content: editContent,
        color: editColor,
        tag: editTag,
        updatedAt: Date.now()
      });
      logActivity(`updated card: "${editContent.substring(0, 15)}..."`);
    }
    setEditingCardId(null);
  };

  // Cancel card edits
  const handleCancelEdit = () => {
    setEditingCardId(null);
  };

  // Persist columns to localStorage
  useEffect(() => {
    localStorage.setItem('sync-suite-kanban-columns', JSON.stringify(columns));
  }, [columns]);

  // Add a new column
  const handleAddColumn = () => {
    setShowAddColModal(true);
  };

  const submitNewColumn = () => {
    if (!newColName.trim()) return;

    const name = newColName.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const color = COLUMN_COLORS[columns.length % COLUMN_COLORS.length];

    setColumns(prev => [...prev, { id, name, color }]);
    logActivity(`created column "${name}"`);
    
    setShowAddColModal(false);
    setNewColName('');
  };

  // Trigger custom in-app delete modal
  const handleDeleteColumn = (columnId) => {
    setColToDelete(columnId);
  };

  // Perform actual column & cards deletion after custom confirmation
  const confirmDeleteColumn = () => {
    if (!colToDelete) return;
    
    const columnId = colToDelete;
    const col = columns.find(c => c.id === columnId);

    // Delete all cards in this column from Yjs Map permanently
    yDoc.transact(() => {
      Object.values(cards).forEach(card => {
        if (card.columnId === columnId) {
          yCards.delete(card.id);
        }
      });
    });

    setColumns(prev => prev.filter(c => c.id !== columnId));
    logActivity(`deleted column "${col?.name}" and all cards inside it`);
    setColToDelete(null);
  };

  // Drag and Drop implementation
  const handleDragStart = (e, cardId) => {
    e.dataTransfer.setData('text/plain', cardId);
    // Mark card as dragging for styling
    const cardEl = document.getElementById(cardId);
    if (cardEl) cardEl.classList.add('dragging');
  };

  const handleDragEnd = (e, cardId) => {
    const cardEl = document.getElementById(cardId);
    if (cardEl) cardEl.classList.remove('dragging');
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('text/plain');

    try {
      const data = JSON.parse(dataStr);
      
      // Handle cross-surface Whiteboard -> Kanban drops
      if (data && data.type === 'whiteboard-sketch') {
        const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newCard = {
          id: cardId,
          content: 'Sketch from Whiteboard',
          columnId: targetColumnId,
          color: 'blue',
          tag: 'Design',
          sketchStrokes: data.strokes,
          createdAt: Date.now(),
          createdBy: localUser?.name || 'Anonymous'
        };
        yCards.set(cardId, newCard);
        setDragOverColumn(null);
        logActivity(`dragged whiteboard sketch into column "${columns.find(c => c.id === targetColumnId)?.name || targetColumnId}"`);
        return;
      }
    } catch (err) {
      // Data is not JSON - proceed with standard card moves
    }

    const cardId = dataStr;
    const card = yCards.get(cardId);
    if (card && card.columnId !== targetColumnId) {
      const originColumnName = columns.find(c => c.id === card.columnId)?.name || card.columnId;
      const targetColumnName = columns.find(c => c.id === targetColumnId)?.name || targetColumnId;
      yCards.set(cardId, {
        ...card,
        columnId: targetColumnId,
        updatedAt: Date.now()
      });
      logActivity(`moved card "${card.content.substring(0, 15)}..." from "${originColumnName}" to "${targetColumnName}"`);
    }
    setDragOverColumn(null);
  };

  // Group and sort cards by column, applying search filters
  const getCardsForColumn = (columnId) => {
    return Object.values(cards)
      .filter((card) => {
        if (card.columnId !== columnId) return false;
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        const contentMatch = card.content?.toLowerCase().includes(query);
        const tagMatch = card.tag?.toLowerCase().includes(query);
        const colorMatch = card.color?.toLowerCase().includes(query);
        return contentMatch || tagMatch || colorMatch;
      })
      .sort((a, b) => a.createdAt - b.createdAt); // order by creation time
  };

    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Kanban Header Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="tool-group">
            <button onClick={() => undoManager?.undo()} title="Undo (Ctrl+Z)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
              <Undo2 size={13} />
            </button>
            <button onClick={() => undoManager?.redo()} title="Redo (Ctrl+Y)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
              <Redo2 size={13} />
            </button>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            💡 Drag the whiteboard sketch icon here to import drawings!
          </span>
        </div>
        
        {/* Right side: Add Column button & Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="setup-submit-btn"
            onClick={handleAddColumn}
            style={{ 
              padding: '6px 16px', 
              fontSize: '13px', 
              height: '34px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              borderRadius: '16px',
              boxShadow: 'none'
            }}
          >
            <Plus size={14} />
            <span>Add Column</span>
          </button>

          {/* Feature 7: Search and Filter Input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              className="text-input"
              style={{ padding: '6px 12px', fontSize: '13px', width: '240px', height: '34px', background: '#ffffff', borderRadius: '16px', border: '1px solid var(--border-soft)', outline: 'none' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards, tags, colors..."
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {columns.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '350px',
          background: 'rgba(255, 255, 255, 0.4)',
          border: '1px dashed var(--border-soft)',
          borderRadius: 'var(--panel-radius)',
          margin: '20px 0',
          gap: '12px'
        }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-muted)' }}>No columns to display</span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '-4px' }}>try creating one</span>
          <button
            className="setup-submit-btn"
            onClick={handleAddColumn}
            style={{ 
              padding: '8px 20px', 
              fontSize: '13px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              borderRadius: '16px',
              boxShadow: 'none',
              marginTop: '12px'
            }}
          >
            <Plus size={14} />
            <span>Create Column</span>
          </button>
        </div>
      ) : (
        <div className="kanban-container">
        {columns.map((col) => {
          const columnCards = getCardsForColumn(col.id);
        const isDefaultColumn = DEFAULT_COLUMNS.some(dc => dc.id === col.id);

        return (
          <div
            key={col.id}
            className={`kanban-column ${dragOverColumn === col.id ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="column-header">
              <div className="column-title-container">
                <span className="column-dot" style={{ backgroundColor: col.color }} />
                <span className="column-title">{col.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="column-count">{columnCards.length}</span>
                <button
                  className="card-btn delete"
                  style={{ width: '22px', height: '22px' }}
                  title="Delete column"
                  onClick={() => handleDeleteColumn(col.id)}
                >
                  <X size={11} />
                </button>
              </div>
            </div>

            <div className="cards-list">
              {columnCards.map((card) => {
                const isEditing = editingCardId === card.id;

                return (
                  <div
                    key={card.id}
                    id={card.id}
                    className={`kanban-card ${card.color ? `card-${card.color}` : ''}`}
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onDragEnd={(e) => handleDragEnd(e, card.id)}
                    onDoubleClick={() => handleStartEdit(card.id, card)}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                          className="text-input"
                          style={{ fontSize: '13px', width: '100%', minHeight: '50px', resize: 'vertical' }}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(card.id);
                            }
                          }}
                          autoFocus
                        />
                        
                        {/* Tag Selection Dropdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>Category Tag</label>
                          <select 
                            value={editTag} 
                            onChange={(e) => setEditTag(e.target.value)} 
                            className="text-input"
                            style={{ fontSize: '11px', padding: '4px 8px', background: '#ffffff', width: '100%', border: '1px solid var(--border-soft)' }}
                          >
                            <option value="">None</option>
                            <option value="Bug">Bug</option>
                            <option value="Feature">Feature</option>
                            <option value="Design">Design</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </div>

                        {/* Card Color Coding Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>Card Color</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {[
                              { name: '', color: 'rgba(0,0,0,0.08)' },
                              { name: 'red', color: 'var(--accent-red)' },
                              { name: 'green', color: 'var(--accent-green)' },
                              { name: 'blue', color: 'var(--accent-teal)' },
                              { name: 'purple', color: 'var(--accent-purple)' }
                            ].map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => setEditColor(c.name)}
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  backgroundColor: c.color,
                                  border: editColor === c.name ? '1.5px solid white' : '1px solid transparent',
                                  cursor: 'pointer'
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                          <button onClick={handleCancelEdit} className="card-btn" title="Cancel">
                            <X size={14} />
                          </button>
                          <button onClick={() => handleSaveEdit(card.id)} className="card-btn" title="Save" style={{ color: 'var(--accent-teal)' }}>
                            <Check size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {card.tag && <div className={`card-tag-pill tag-${card.tag}`}>{card.tag}</div>}
                        <div className="card-content">{card.content}</div>
                        {card.sketchStrokes && <SketchThumbnail strokes={card.sketchStrokes} />}
                        <div className="card-actions">
                          <button onClick={() => handleStartEdit(card.id, card)} className="card-btn" title="Edit">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => handleDeleteCard(card.id)} className="card-btn delete" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Peer Drag Indicator (Active cursors or drags in Kanban) */}
                        <div className="card-presence-indicators">
                          {peers
                            .filter(p => p.activeTab === 'kanban' && p.cursor === card.id)
                            .map((p, idx) => (
                              <span 
                                key={idx} 
                                className="card-presence-dot" 
                                style={{ 
                                  backgroundColor: p.color,
                                  boxShadow: `0 0 6px ${p.color}`
                                }}
                                title={`${p.name} is looking at this`}
                              />
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <button className="add-card-btn" onClick={() => handleAddCard(col.id)}>
              <Plus size={14} />
              <span>Add Card</span>
            </button>
          </div>
        );
      })}
      </div>
      )}

      {/* Custom delete column confirmation modal (No chrome popups!) */}
      {colToDelete && (
        <div className="modal-overlay">
          <div className="setup-modal" style={{ maxWidth: '380px', padding: '28px 32px' }}>
            <h2 className="modal-title" style={{ fontSize: '22px', marginBottom: '12px', color: 'var(--accent-red)' }}>Delete Column</h2>
            <p className="modal-desc" style={{ fontSize: '13px', marginBottom: '24px', lineHeight: '1.6' }}>
              Are you sure you want to delete column <strong>"{columns.find(c => c.id === colToDelete)?.name}"</strong>? All cards inside it will be permanently deleted.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="wb-tool-btn" 
                style={{ borderRadius: 'var(--button-radius)', padding: '8px 16px', width: 'auto', height: 'auto', border: '1px solid var(--border-soft)', fontSize: '13px' }}
                onClick={() => setColToDelete(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="card-btn delete" 
                style={{ padding: '8px 16px', width: 'auto', height: 'auto', background: 'var(--accent-red)', color: '#ffffff', border: 'none', borderRadius: 'var(--button-radius)', fontSize: '13px', fontWeight: 500 }}
                onClick={confirmDeleteColumn}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app modal popup for adding column name */}
      {showAddColModal && (
        <div className="modal-overlay">
          <div className="setup-modal" style={{ maxWidth: '380px', padding: '28px 32px' }}>
            <h2 className="modal-title" style={{ fontSize: '24px', marginBottom: '12px' }}>Create New Column</h2>
            <p className="modal-desc" style={{ fontSize: '13px', marginBottom: '20px' }}>
              Enter a name for the new workspace column:
            </p>
            
            <div className="input-group">
              <input
                type="text"
                className="text-input"
                style={{ width: '100%', padding: '10px 14px' }}
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Column title (e.g. Backlog, Blocked)"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNewColumn();
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button 
                type="button" 
                className="wb-tool-btn" 
                style={{ borderRadius: 'var(--button-radius)', padding: '8px 16px', width: 'auto', height: 'auto', border: '1px solid var(--border-soft)', fontSize: '13px' }}
                onClick={() => {
                  setShowAddColModal(false);
                  setNewColName('');
                }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="setup-submit-btn" 
                style={{ padding: '8px 16px', fontSize: '13px' }}
                onClick={submitNewColumn}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
