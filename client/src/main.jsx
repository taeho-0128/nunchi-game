import React from 'react'
import ReactDOM from 'react-dom/client'
import Lobby from './pages/Lobby.jsx'
import './index.css' // 없으면 이 줄은 제거해도 OK

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Lobby />
  </React.StrictMode>
)