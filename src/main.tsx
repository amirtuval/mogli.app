import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import ReminderPopupWindow from './components/ReminderPopupWindow'
import './styles/global.css'

const windowLabel = getCurrentWindow().label
const isReminderPopup = windowLabel === 'reminder-popup'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isReminderPopup ? <ReminderPopupWindow /> : <App />}</React.StrictMode>,
)
