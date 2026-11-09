// React entry point.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/manrope';
import { App } from './App.jsx';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
