import React, { useEffect, useRef, useState } from 'react';
import { useYjs } from '../context/YjsContext';
import { Edit2, Eraser, Trash2, Undo2, Redo2, Image, Square, Circle, Slash, Zap, Maximize2, Minimize2 } from 'lucide-react';
import * as Y from 'yjs';

const BRUSH_SIZES = [2, 5, 10, 15];
const STROKE_COLORS = [
  '#3d3929', // Ink
  '#8b6f4e', // Brown
  '#c4956a', // Warm
  '#c07a5a', // Clay
  '#c45c4f', // Red
  '#6b8f71', // Sage
  '#5b8dbf', // Blue
  '#8b7bb5', // Purple
  '#e8a840', // Amber
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f3f4f6', // Light
];

const Whiteboard = () => {
  const { yDoc, provider, peers, localUser, updateLocalPresence, logActivity } = useYjs();
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  const [tool, setTool] = useState('brush'); // 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'laser'
  const [brushColor, setBrushColor] = useState('#3d3929');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const activeStrokeIdRef = useRef(null);

  // States for Shape drawing
  const [startPoint, setStartPoint] = useState(null);
  const [currentDragPoint, setCurrentDragPoint] = useState(null);
  
  // Laser Pointer local state
  const laserPointsRef = useRef([]);

  // Zoom & Pan States (n8n/Figma style infinite canvas)
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const yStrokes = yDoc.getMap('whiteboard-strokes');
  const [undoManager, setUndoManager] = useState(null);

  // Initialize Y.UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(yStrokes);
    setUndoManager(um);
    return () => um.destroy();
  }, [yStrokes]);

  // Bind Ctrl+Z / Ctrl+Y keyboard shortcuts
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

  // Listen to Spacebar key binds for pan cursor toggles
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        setSpacePressed(true);
        e.preventDefault(); // prevent page scrolling
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Coordinate conversion helper: client viewport coordinates to absolute canvas virtual coordinates
  const getCanvasCoords = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom
    };
  };

  // Serializes the active whiteboard strokes to drop onto Kanban columns or cards
  const handleDragSketchStart = (e) => {
    const activeStrokes = Array.from(yStrokes.values()).filter(s => !s.deleted);
    if (activeStrokes.length === 0) {
      e.preventDefault();
      alert("Draw something on the canvas first before dragging!");
      return;
    }
    const data = {
      type: 'whiteboard-sketch',
      strokes: activeStrokes,
      draggedAt: Date.now()
    };
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Set up canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * 2; // high DPI support
        canvas.height = rect.height * 2;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        contextRef.current = ctx;
        
        drawAllStrokes();
      });
    };

    // Use a small timeout to let React commit the DOM updates and the browser reflow layout first
    const timer = setTimeout(resizeCanvas, 30);

    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [panOffset, zoom, isFullscreen]); // Re-register size transforms on pan/zoom/fullscreen changes

  // Redraw canvas when yStrokes changes
  useEffect(() => {
    const handleObserve = () => {
      drawAllStrokes();
    };

    yStrokes.observe(handleObserve);
    return () => {
      yStrokes.unobserve(handleObserve);
    };
  }, [yStrokes, panOffset, zoom, isFullscreen]);

  // Main drawing logic
  const drawAllStrokes = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;

    // Clear canvas relative to screen coordinates
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    
    // Apply pan and zoom offsets
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw programmatic visible grid background directly so it pans and zooms with content
    const gridSpacing = 24;
    const rect = canvas.getBoundingClientRect();
    const left = -panOffset.x / zoom;
    const top = -panOffset.y / zoom;
    const right = (rect.width - panOffset.x) / zoom;
    const bottom = (rect.height - panOffset.y) / zoom;

    ctx.fillStyle = 'rgba(180, 168, 145, 0.22)';
    const startX = Math.floor(left / gridSpacing) * gridSpacing;
    const startY = Math.floor(top / gridSpacing) * gridSpacing;

    for (let gx = startX; gx < right; gx += gridSpacing) {
      for (let gy = startY; gy < bottom; gy += gridSpacing) {
        ctx.beginPath();
        const dotRadius = Math.max(0.6, Math.min(1.2 / zoom, 1.5));
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Get all strokes from the CRDT map
    const strokes = Array.from(yStrokes.values());
    strokes.sort((a, b) => a.createdAt - b.createdAt);

    strokes.forEach((stroke) => {
      if (stroke.deleted || !stroke.points || stroke.points.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;

      if (stroke.type === 'line') {
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
        ctx.stroke();
      } else if (stroke.type === 'rect') {
        const p0 = stroke.points[0];
        const p1 = stroke.points[1];
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      } else if (stroke.type === 'circle') {
        const p0 = stroke.points[0];
        const p1 = stroke.points[1];
        const radius = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
        ctx.arc(p0.x, p0.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        const firstPoint = stroke.points[0];
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < stroke.points.length; i++) {
          const point = stroke.points[i];
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }
    });

    // Draw Local Shape Preview (Dotted lines) while dragging
    if (isDrawing && startPoint && currentDragPoint && ['line', 'rect', 'circle'].includes(tool)) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.setLineDash([4, 4]);

      if (tool === 'line') {
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(currentDragPoint.x, currentDragPoint.y);
        ctx.stroke();
      } else if (tool === 'rect') {
        ctx.strokeRect(startPoint.x, startPoint.y, currentDragPoint.x - startPoint.x, currentDragPoint.y - startPoint.y);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(currentDragPoint.x - startPoint.x, 2) + Math.pow(currentDragPoint.y - startPoint.y, 2));
        ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.setLineDash([]); // Reset line dash
    }

    // Draw local active laser pointer if active
    if (tool === 'laser' && laserPointsRef.current && laserPointsRef.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.moveTo(laserPointsRef.current[0].x, laserPointsRef.current[0].y);
      for (let i = 1; i < laserPointsRef.current.length; i++) {
        ctx.lineTo(laserPointsRef.current[i].x, laserPointsRef.current[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw active remote drawings (unsaved strokes currently being drawn by others)
    drawRemoteCursors(ctx);

    ctx.restore();
  };

  // Draw remote mouse cursor brush strokes/labels
  const drawRemoteCursors = (ctx) => {
    peers.forEach((peer) => {
      if (peer.activeTab === 'whiteboard' && peer.cursor) {
        const { x, y, drawing, color, brushSize, tool: peerTool, laserPoints } = peer.cursor;
        
        // Draw laser pointer glowing line trail if active
        if (peerTool === 'laser' && laserPoints && laserPoints.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.moveTo(laserPoints[0].x, laserPoints[0].y);
          for (let i = 1; i < laserPoints.length; i++) {
            ctx.lineTo(laserPoints[i].x, laserPoints[i].y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0; // Reset glow
        }

        // Draw remote pointer
        ctx.beginPath();
        ctx.arc(x, y, (peerTool === 'eraser' ? 12 : brushSize / 2) + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw remote name tag
        ctx.font = '9px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(peer.name, x + 8, y - 4);

        // Draw Multiplayer Cursor Chat Bubble on canvas next to cursor
        if (peer.cursorChat) {
          ctx.font = '10px sans-serif';
          const textWidth = ctx.measureText(peer.cursorChat).width;
          ctx.fillStyle = color || '#6366f1';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x + 8, y - 24, textWidth + 12, 16, 4);
          } else {
            ctx.rect(x + 8, y - 24, textWidth + 12, 16);
          }
          ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(peer.cursorChat, x + 14, y - 12);
        }
      }
    });
  };

  // Redraw remote cursors on awareness changes
  useEffect(() => {
    drawAllStrokes();
  }, [peers]);

  // Start Drawing or Panning
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if we should pan instead of draw (space pressed or middle/right click)
    const shouldPan = spacePressed || e.button === 1 || e.button === 2;
    if (shouldPan) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    // Only draw with left click
    if (e.button !== 0) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const { x, y } = coords;

    setIsDrawing(true);

    if (tool === 'brush') {
      const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      activeStrokeIdRef.current = strokeId;

      const newStroke = {
        id: strokeId,
        type: 'brush',
        points: [{ x, y }],
        color: brushColor,
        width: brushSize,
        deleted: false,
        createdAt: Date.now(),
      };

      yStrokes.set(strokeId, newStroke);
      updateCursorPresence(x, y, true);
    } else if (['line', 'rect', 'circle'].includes(tool)) {
      // Shape drawing setup
      setStartPoint({ x, y });
      setCurrentDragPoint({ x, y });
      updateCursorPresence(x, y, true);
    } else if (tool === 'laser') {
      laserPointsRef.current = [{ x, y }];
      updateCursorPresence(x, y, true);
    } else if (tool === 'eraser') {
      eraseAtPoint(x, y);
      updateCursorPresence(x, y, true);
    }
  };

  // Continue Drawing / Erasing / Laser or Panning
  const draw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isPanning) {
      const newOffsetX = e.clientX - panStartRef.current.x;
      const newOffsetY = e.clientY - panStartRef.current.y;
      setPanOffset({ x: newOffsetX, y: newOffsetY });
      drawAllStrokes(); // redraw immediately to show new offset
      return;
    }

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const { x, y } = coords;

    updateCursorPresence(x, y, isDrawing);

    if (!isDrawing) return;

    if (tool === 'brush' && activeStrokeIdRef.current) {
      const strokeId = activeStrokeIdRef.current;
      const stroke = yStrokes.get(strokeId);
      
      if (stroke) {
        if (stroke.deleted) {
          activeStrokeIdRef.current = null;
          setIsDrawing(false);
          return;
        }
        const updatedPoints = [...stroke.points, { x, y }];
        yStrokes.set(strokeId, {
          ...stroke,
          points: updatedPoints,
        });
      }
    } else if (['line', 'rect', 'circle'].includes(tool) && startPoint) {
      setCurrentDragPoint({ x, y });
      drawAllStrokes(); // force local dotted preview update
    } else if (tool === 'laser') {
      laserPointsRef.current = [...laserPointsRef.current, { x, y }].slice(-15);
      updateCursorPresence(x, y, true);
      drawAllStrokes(); // force redraw to render local laser Pointer
    } else if (tool === 'eraser') {
      eraseAtPoint(x, y);
    }
  };

  // Stop Drawing / Commit finalized Shapes / Stop Panning
  const stopDrawing = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing) return;
    
    if (['line', 'rect', 'circle'].includes(tool) && startPoint && currentDragPoint) {
      // Push shapes to CRDT yStrokes
      const strokeId = `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Don't commit zero-width shapes
      const dx = Math.abs(currentDragPoint.x - startPoint.x);
      const dy = Math.abs(currentDragPoint.y - startPoint.y);
      if (dx > 2 || dy > 2) {
        const newShape = {
          id: strokeId,
          type: tool,
          points: [startPoint, currentDragPoint],
          color: brushColor,
          width: brushSize,
          deleted: false,
          createdAt: Date.now()
        };
        yStrokes.set(strokeId, newShape);
      }
    }
    
    setIsDrawing(false);
    activeStrokeIdRef.current = null;
    setStartPoint(null);
    setCurrentDragPoint(null);
    laserPointsRef.current = [];

    // Reset drawing state in cursor presence
    const canvas = canvasRef.current;
    if (canvas) {
      const cursor = localUser?.cursor || {};
      updateLocalPresence({
        cursor: {
          ...cursor,
          drawing: false,
          laserPoints: null
        }
      });
    }
  };

  // Bind wheel zoom/pan to DOM with passive: false to lock onto the whiteboard and block browser zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheelEvent = (e) => {
      // Prevent browser default page scroll and full-screen zoom
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey) {
        // Pinch to Zoom or Ctrl+Scroll
        const zoomFactor = 1.08;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newZoom = direction > 0 
          ? Math.min(zoom * zoomFactor, 8) 
          : Math.max(zoom / zoomFactor, 0.15);

        // Zoom centered on mouse cursor
        const newOffsetX = mouseX - (mouseX - panOffset.x) * (newZoom / zoom);
        const newOffsetY = mouseY - (mouseY - panOffset.y) * (newZoom / zoom);

        setZoom(newZoom);
        setPanOffset({ x: newOffsetX, y: newOffsetY });
      } else {
        // Swipe/Scroll to Pan
        setPanOffset(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    canvas.addEventListener('wheel', onWheelEvent, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheelEvent);
    };
  }, [zoom, panOffset]);

  const handleZoomStep = (direction) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const zoomFactor = 1.3;
    const newZoom = direction > 0 
      ? Math.min(zoom * zoomFactor, 8) 
      : Math.max(zoom / zoomFactor, 0.15);

    const newOffsetX = centerX - (centerX - panOffset.x) * (newZoom / zoom);
    const newOffsetY = centerY - (centerY - panOffset.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPanOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleZoomReset = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Erasing algorithm (tombstoning strokes that intersect within eraser radius)
  const eraseAtPoint = (x, y) => {
    const eraserRadius = 15;
    const strokes = Array.from(yStrokes.values());

    strokes.forEach((stroke) => {
      if (stroke.deleted || !stroke.points) return;

      // Check if any point in the stroke is close to the eraser center
      const intersects = stroke.points.some((point) => {
        const dist = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
        return dist <= eraserRadius;
      });

      if (intersects) {
        // Tombstone the stroke by setting deleted: true
        yStrokes.set(stroke.id, {
          ...stroke,
          deleted: true,
          deletedAt: Date.now(),
        });
        logActivity(`erased a stroke on the Whiteboard`);
      }
    });
  };

  // Sync cursor presence to awareness
  const updateCursorPresence = (x, y, drawingState) => {
    updateLocalPresence({
      cursor: {
        x,
        y,
        drawing: drawingState,
        color: localUser?.color || '#6366f1',
        brushSize,
        tool,
        ...(tool === 'laser' && { laserPoints: laserPointsRef.current })
      }
    });
  };

  // Clear Whiteboard (Tombstones all active strokes)
  const handleClearBoard = () => {
    yDoc.transact(() => {
      Array.from(yStrokes.values()).forEach((stroke) => {
        if (!stroke.deleted) {
          yStrokes.set(stroke.id, {
            ...stroke,
            deleted: true,
            deletedAt: Date.now(),
          });
        }
      });
    });
    logActivity("cleared the Whiteboard");
  };

  return (
    <div className={`whiteboard-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          cursor: spacePressed || isPanning
            ? (isPanning ? 'grabbing' : 'grab')
            : (tool === 'eraser' ? 'cell' : 'crosshair')
        }}
      />

      {/* Center Top Zoom & Fullscreen Controls Overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#ffffff',
        border: '1px solid var(--border-soft)',
        borderRadius: '24px',
        padding: '4px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--shadow-medium)',
        zIndex: 10
      }}>
        <button 
          className="wb-tool-btn" 
          style={{ width: '22px', height: '22px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          onClick={() => handleZoomStep(-1)}
          title="Zoom Out"
        >
          -
        </button>
        <span 
          style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            color: 'var(--text-muted)', 
            cursor: 'pointer',
            minWidth: '38px',
            textAlign: 'center',
            userSelect: 'none'
          }}
          onClick={handleZoomReset}
          title="Reset Zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button 
          className="wb-tool-btn" 
          style={{ width: '22px', height: '22px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          onClick={() => handleZoomStep(1)}
          title="Zoom In"
        >
          +
        </button>

        <div className="wb-divider" style={{ height: '14px', margin: '0 2px' }} />

        {/* Fullscreen Button */}
        <button 
          className="wb-tool-btn" 
          style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFullscreen ? 'var(--accent-brown)' : 'var(--text-muted)' }} 
          onClick={() => setIsFullscreen(prev => !prev)}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* Floating Toolbar */}
      <div className="whiteboard-toolbar">
        {/* Tools Selection */}
        <div className="tool-group" style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`wb-tool-btn ${tool === 'brush' ? 'active' : ''}`}
            onClick={() => setTool('brush')}
            title="Pen Tool"
          >
            <Edit2 size={15} />
          </button>
          
          {/* Feature 4: Shapes Buttons */}
          <button
            className={`wb-tool-btn ${tool === 'line' ? 'active' : ''}`}
            onClick={() => setTool('line')}
            title="Line Tool"
          >
            <Slash size={15} />
          </button>
          <button
            className={`wb-tool-btn ${tool === 'rect' ? 'active' : ''}`}
            onClick={() => setTool('rect')}
            title="Rectangle Tool"
          >
            <Square size={15} />
          </button>
          <button
            className={`wb-tool-btn ${tool === 'circle' ? 'active' : ''}`}
            onClick={() => setTool('circle')}
            title="Circle Tool"
          >
            <Circle size={15} />
          </button>
          
          {/* Feature 8: Laser Pointer Button */}
          <button
            className={`wb-tool-btn ${tool === 'laser' ? 'active' : ''}`}
            onClick={() => setTool('laser')}
            title="Laser Pointer Tool"
            style={{ color: 'var(--accent-red)' }}
          >
            <Zap size={15} />
          </button>
          
          <button
            className={`wb-tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser Tool"
          >
            <Eraser size={15} />
          </button>
        </div>

        <div className="wb-divider" />

        {/* Color Picker: single swatch + popover */}
        {tool === 'brush' && (
          <div style={{ position: 'relative' }}>
            <button
              className="wb-tool-btn"
              onClick={() => setShowColorPicker(prev => !prev)}
              title="Pick Color"
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: brushColor,
                border: '2px solid var(--border-medium)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              }} />
            </button>

            {showColorPicker && (
              <div style={{
                position: 'absolute',
                bottom: '46px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#ffffff',
                border: '1px solid var(--border-soft)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                width: '180px',
                boxShadow: 'var(--shadow-lifted)',
                zIndex: 100
              }}>
                {STROKE_COLORS.map((color) => (
                  <div
                    key={color}
                    onClick={() => { setBrushColor(color); setShowColorPicker(false); }}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      cursor: 'pointer',
                      border: brushColor === color ? '2px solid var(--text-main)' : '2px solid transparent',
                      boxShadow: brushColor === color ? '0 0 0 2px rgba(61,57,41,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tool === 'brush' && <div className="wb-divider" />}

        {/* Brush Size Slider */}
        <div className="tool-group" style={{ gap: '8px' }}>
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              className={`wb-tool-btn ${brushSize === size ? 'active' : ''}`}
              style={{ width: '28px', height: '28px', fontSize: '11px', fontWeight: 600 }}
              onClick={() => setBrushSize(size)}
            >
              {size}
            </button>
          ))}
        </div>

        <div className="wb-divider" />

        {/* Clear Action */}
        <button
          className="wb-tool-btn"
          onClick={handleClearBoard}
          title="Clear Board"
          style={{ color: 'var(--accent-pink)' }}
        >
          <Trash2 size={16} />
        </button>

        <div className="wb-divider" />

        {/* Undo/Redo */}
        <div className="tool-group">
          <button onClick={() => undoManager?.undo()} title="Undo (Ctrl+Z)" className="wb-tool-btn">
            <Undo2 size={16} />
          </button>
          <button onClick={() => undoManager?.redo()} title="Redo (Ctrl+Y)" className="wb-tool-btn">
            <Redo2 size={16} />
          </button>
        </div>

        <div className="wb-divider" />

        {/* Drag to Kanban Handle */}
        <button
          className="wb-tool-btn"
          draggable
          onDragStart={handleDragSketchStart}
          title="Drag Sketch to Kanban (Drag Me!)"
          style={{ color: 'var(--accent-teal)', cursor: 'grab' }}
        >
          <Image size={16} />
        </button>
      </div>
    </div>
  );
};

export default Whiteboard;
