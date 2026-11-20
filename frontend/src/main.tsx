import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/golos-text';
import { App } from './app';
import { theme } from './theme';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>,
);
