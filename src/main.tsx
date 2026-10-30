import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import 'katex/dist/katex.min.css';
import './ui/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyThemeToDocument } from './render/theme';
import { useUiStore } from './state/uiStore';
import { AppShell } from './ui/AppShell';

applyThemeToDocument();
document.documentElement.lang = useUiStore.getState().lang;

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
