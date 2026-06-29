import React, { useEffect, useRef, useState } from 'react';
import { useYjs } from '../context/YjsContext';
import { Undo2, Redo2 } from 'lucide-react';
import * as Y from 'yjs';

const Spreadsheet = () => {
  const { yDoc, peers, localUser, logActivity } = useYjs();
  const ySpreadsheet = yDoc.getMap('spreadsheet-cells-v2');
  const isRemoteChangeRef = useRef(false);
  const [undoManager, setUndoManager] = useState(null);

  // Initialize Y.UndoManager
  useEffect(() => {
    const um = new Y.UndoManager(ySpreadsheet);
    setUndoManager(um);
    return () => um.destroy();
  }, [ySpreadsheet]);

  useEffect(() => {
    if (!window.luckysheet) {
      console.error('Luckysheet is not loaded from CDN');
      return;
    }

    // 1. Gather all existing data from Yjs map to populate initial state
    const celldata = [];
    ySpreadsheet.forEach((cellObj, key) => {
      const [rStr, cStr] = key.split('_');
      if (cellObj) {
        celldata.push({
          r: parseInt(rStr, 10),
          c: parseInt(cStr, 10),
          v: cellObj
        });
      }
    });

    // 2. Initialize Luckysheet
    window.luckysheet.create({
      container: 'luckysheet-container',
      title: 'Collaborative Workspace Sheet',
      lang: 'en',
      data: [
        {
          name: 'Sheet1',
          color: '',
          index: 0,
          status: 1,
          order: 0,
          celldata: celldata,
          config: {}
        }
      ],
      showinfobar: false,
      showsheetbar: false, // hide bottom sheet bar to keep it clean and minimalist
      showstatisticBar: false,
      sheetFormulaBar: true,
      enableAddRow: true,
      enableAddCol: true,
      userInfo: false,
      hook: {
        cellUpdated: (r, c, oldValue, newValue) => {
          if (isRemoteChangeRef.current) return;

          // Get the full cell object from Luckysheet
          const cellObj = window.luckysheet.getCellValue(r, c);
          
          // Deep compare before writing to Yjs to prevent update cascades
          const yVal = ySpreadsheet.get(`${r}_${c}`);
          if (JSON.stringify(cellObj) === JSON.stringify(yVal)) return;
          
          yDoc.transact(() => {
            if (cellObj === null || cellObj === undefined || cellObj.v === null || cellObj.v === '') {
              ySpreadsheet.delete(`${r}_${c}`);
            } else {
              ySpreadsheet.set(`${r}_${c}`, cellObj);
            }
          });

          logActivity(`edited cell at Row ${r + 1}, Col ${c + 1}`);
        },
        updated: (operate) => {
          if (isRemoteChangeRef.current) return;
          try {
            const op = typeof operate === 'string' ? JSON.parse(operate) : operate;
            if (!op) return;

            // Handle value update/delete operations (type 'v')
            if (op.t === 'v') {
              const r = op.r;
              const c = op.c;
              const cellObj = op.v;

              // Deep compare to prevent duplicate write echoes
              const yVal = ySpreadsheet.get(`${r}_${c}`);
              if (JSON.stringify(cellObj) === JSON.stringify(yVal)) return;

              yDoc.transact(() => {
                if (cellObj === null || cellObj === undefined || cellObj.v === null || cellObj.v === '' || cellObj === '#__qkdelete#') {
                  ySpreadsheet.delete(`${r}_${c}`);
                } else {
                  ySpreadsheet.set(`${r}_${c}`, cellObj);
                }
              });
            }
          } catch (e) {
            console.error('Error handling Luckysheet update:', e);
          }
        }
      }
    });

    // 3. Observe Yjs Map for remote updates
    const handleObserve = (event) => {
      // Ignore local edits to prevent self-overwrite render loops
      if (event.transaction.local) return;

      // Set remote change flag to prevent cellUpdated hook echo loop
      isRemoteChangeRef.current = true;

      event.keysChanged.forEach((key) => {
        const [rStr, cStr] = key.split('_');
        const r = parseInt(rStr, 10);
        const c = parseInt(cStr, 10);
        const cellObj = ySpreadsheet.get(key);

        if (cellObj) {
          window.luckysheet.setCellValue(r, c, cellObj);
        } else {
          window.luckysheet.setCellValue(r, c, null);
        }
      });

      // Refresh view to apply updates
      window.luckysheet.refresh();

      // Release lock after layout and repainting microtasks have completely drained
      setTimeout(() => {
        isRemoteChangeRef.current = false;
      }, 50);
    };

    ySpreadsheet.observe(handleObserve);

    return () => {
      ySpreadsheet.unobserve(handleObserve);
      if (window.luckysheet && window.luckysheet.destroy) {
        window.luckysheet.destroy();
      }
    };
  }, [ySpreadsheet]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="tool-group">
            <button onClick={() => undoManager?.undo()} title="Undo (Ctrl+Z)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
              <Undo2 size={13} />
            </button>
            <button onClick={() => undoManager?.redo()} title="Redo (Ctrl+Y)" className="wb-tool-btn" style={{ width: '28px', height: '28px' }}>
              <Redo2 size={13} />
            </button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            💡 Fully featured Excel formulas (=SUM, =AVERAGE), formatting, and multi-user sync active!
          </span>
        </div>
      </div>

      {/* Spreadsheet Container */}
      <div 
        style={{ 
          flexGrow: 1, 
          height: 'calc(100vh - 240px)', 
          position: 'relative',
          background: '#ffffff',
          borderRadius: 'var(--panel-radius)',
          overflow: 'hidden'
        }}
      >
        <div 
          id="luckysheet-container" 
          style={{ 
            position: 'absolute', 
            inset: 0, 
            margin: 0, 
            padding: 0 
          }} 
        />
      </div>
    </div>
  );
};

export default Spreadsheet;
