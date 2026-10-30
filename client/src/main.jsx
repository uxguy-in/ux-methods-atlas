import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
// After styles.css, so the calculator finding and learning styles can refine the shared ones.
import './components/calc-learn.css';
// The research bias map and its strips on method and calculator pages.
import './components/bias-map.css';

// GitHub Pages serves only static files, so the Pages build uses hash URLs that need no server rewrites.
const Router = import.meta.env.VITE_STATIC === '1' ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
