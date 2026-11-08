import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { runCliBatch } from './batch/cliBatch';
import './styles.css';

// Load fonts locally for offline support and consistent rendering
// Roboto (default)
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

// Inter (modern)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';

// Open Sans (Google Maps style)
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/700.css';

// Noto Sans (universal multilingual)
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/700.css';

// Command line (carto --batch): a hidden window runs the batch, without the application
if (new URLSearchParams(window.location.search).get('mode') === 'batch-cli') {
  runCliBatch(window.electronAPI.batch).catch(error => {
    window.electronAPI.batch.cliLog(`Erreur : ${String(error)}`, true);
    window.electronAPI.batch.cliDone(2);
  });
} else {
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
