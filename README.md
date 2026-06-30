# Sync Suite 🚀

Sync Suite is a premium, unified multiplayer workspace designed for remote teams, students, and agile builders. It integrates a **Document Editor**, an **Infinite Whiteboard**, a **Bespoke Kanban Board**, and a **Desktop-Grade Spreadsheet Engine** into a single, seamless, and lightweight web application.

Powered by **Yjs CRDTs** and a **24/7 non-sleeping Node.js WebSocket signaling server**, it delivers sub-millisecond collaboration, instant page synchronization, and secure workspace isolation with zero user friction.

---

## 🎨 Features & Capabilities

### 1. Multiplayer Document Editor (Write)
* **Real-Time Rich Text Editing**: Character-level synchronization preventing conflicts.
* **Markdown Parser**: Write in Markdown and toggle dynamic, rendered visual previews instantly.
* **Undo/Redo History**: Local, transaction-aware undo/redo managers (`Ctrl+Z` / `Ctrl+Y`).
* **Active Typers Presence**: Groups active peer presence indicators in a neat, eye-comforting row.

### 2. Infinite Whiteboard (Sketch)
* **Figma-Grade Pan & Zoom**: Smooth panning and mouse-centered zoom overrides.
* **Locked Browser Zoom**: Intercepts default trackpad pinch gesture commands to keep the zoom locked to the drawing workspace.
* **Auto-Scaling Dot Grid**: A programmatic background grid that translates, scales, and aligns dynamically with drawings.
* **Sketches to Cards**: Drag and drop custom whiteboard sketch elements directly into your Kanban board!

### 3. Dynamic Kanban Board (Organize)
* **Custom Columns & Modals**: Complete column control with custom, in-app modals.
* **Empty Board Support**: Supports removing all columns, replacing the empty view with a premium placeholder state and a centered board initiator button.
* **Card Drag-and-Drop**: Easily move cards between columns.

### 4. High-Performance Spreadsheet Engine (Spreadsheet)
* **Luckysheet Integration**: Canvas-rendered sheet supporting cell resizing, styling, and **300+ Excel formulas** (`=SUM()`, `=AVERAGE()`).
* **Granular Synced Mapping**: Synchronizes cell values, formats, and colors via granular Yjs Map transactions.
* **Echo Loop Prevention**: Built-in deep comparison check (`JSON.stringify`) and asynchronous lock release to eliminate rendering feedback loops.

---

## 🔒 Security & Optimization

* **Private Room Codes**: Spin up new, secure rooms automatically via 6-character room codes (`?room=CODE`).
* **Server-Side Room Validation**: Validates room codes against active server sessions before joining, preventing invalid entry.
* **Auto-Garbage Collection**: Backend automatically monitors connection statuses and purges rooms from server RAM once all active devices disconnect, saving server resources and protecting privacy.
* **Dynamic Client Resolution**: Generates unique clientIDs dynamically on launch to prevent tab duplication sync conflicts.

---

## 🛠️ Tech Stack

* **Frontend**: React (Vite), JavaScript, Vanilla CSS, HTML5 Canvas
* **Collaboration & Sync**: Yjs, y-protocols, y-websocket (client)
* **Spreadsheet Engine**: Luckysheet
* **Backend Server**: Node.js, ws (WebSockets), y-websocket (server)
* **Hosting**: Vercel (Frontend), Railway (Backend Server)

---

## 🚀 Running Locally

### Prerequisites
* [Node.js](https://nodejs.org) (v18 or higher)
* npm

### 1. Start the Backend Signaling Server
Navigate to the root directory and start the local WebSocket signaling server:
```bash
node server.js
```
The server will boot on `ws://localhost:1234`.

### 2. Run the Frontend App
Open a new terminal session, navigate to the root directory, install dependencies, and start the Vite development server:
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

*To test multiplayer sync locally, simply duplicate the tab or open an incognito window!*

---

## 📦 Building for Production

To compile a highly optimized production bundle:
```bash
npm run build
```
Vite will output the static assets into the `dist/` directory, ready to be deployed to Vercel or Netlify.
