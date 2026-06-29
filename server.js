import { WebSocketServer } from 'ws';
import http from 'http';
import { setupWSConnection, docs } from 'y-websocket/bin/utils';

const port = process.env.PORT || 1234;
const server = http.createServer((request, response) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Max-Age': 2592000, // 30 days
  };

  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  
  if (url.pathname === '/api/check-room') {
    const room = url.searchParams.get('room');
    const roomName = `sync-suite-room-${room ? room.trim().toUpperCase() : ''}`;
    const exists = docs.has(roomName);

    response.writeHead(200, { 
      ...headers,
      'Content-Type': 'application/json' 
    });
    response.end(JSON.stringify({ exists }));
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Type': 'text/plain' });
  response.end('Yjs WebSocket Server is running!\n');
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);

  // Parse room name from the request URL
  const url = new URL(req.url, 'http://localhost');
  const roomName = url.pathname.slice(1);

  // Automatically garbage collect rooms when all users disconnect
  ws.on('close', () => {
    setTimeout(() => {
      const doc = docs.get(roomName);
      if (doc && doc.conns.size === 0) {
        docs.delete(roomName);
        console.log(`Garbage collected empty room: ${roomName}`);
      }
    }, 100);
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port, () => {
  console.log(`Yjs server running on port ${port}`);
});
