import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { YjsProvider } from './context/YjsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <YjsProvider>
      <App />
    </YjsProvider>
  </StrictMode>,
)
