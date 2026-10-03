import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ContentProvider } from './content/ContentProvider.tsx'
import { KeybindsProvider } from './lib/KeybindsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContentProvider>
      <KeybindsProvider>
        <App />
      </KeybindsProvider>
    </ContentProvider>
  </StrictMode>,
)
