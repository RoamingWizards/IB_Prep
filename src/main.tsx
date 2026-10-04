import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ContentProvider } from './content/ContentProvider.tsx'
import { KeybindsProvider } from './lib/KeybindsProvider.tsx'
import { ThemeProvider } from './lib/ThemeProvider.tsx'
import { applyTheme, readStoredTheme } from './lib/themeApply.ts'

// Apply the saved colours before the first render so there is no flash of the default theme.
applyTheme(readStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ContentProvider>
        <KeybindsProvider>
          <App />
        </KeybindsProvider>
      </ContentProvider>
    </ThemeProvider>
  </StrictMode>,
)
