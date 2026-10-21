import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { LangProvider } from './components/LangSwitch.tsx'
import './lib/pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LangProvider>
        <App />
      </LangProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Service worker: HTTPS atau localhost. Ia membolehkan "Pasang app" dan notifikasi push alarm kelas.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* tidak kritikal */ }) })
}
