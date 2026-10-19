import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installSelectMenus } from './selectMenu';
import { installShareLinks } from './share';

// Dropdown lists drawn in the page, so they never spill off the browser window.
installSelectMenus();
// A share link (#design=…) opens the design it carries.
installShareLinks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
