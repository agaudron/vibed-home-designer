import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installSelectMenus } from './selectMenu';

// Dropdown lists drawn in the page, so they never spill off the browser window.
installSelectMenus();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
