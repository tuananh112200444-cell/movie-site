import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Theme = 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'khophim-theme';
const TRANSITION_DURATION = 350; // ms — must match CSS transition duration

function getInitialTheme(): Theme {
  // 1. Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'dark') return stored;
    } catch {
      // Storage can be unavailable in private mode or strict browsers.
    }
  }
  // 2. Default to dark (site's original theme)
  return 'dark';
}

function enableTransition() {
  document.documentElement.classList.add('theme-transitioning');
}

function disableTransition() {
  document.documentElement.classList.remove('theme-transitioning');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.remove('light');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Hydration: ensure class is set on first render
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.remove('light');
  }, []);

  const toggleTheme = () => {
    // No-op: light theme disabled
  };

  const setTheme = (t: Theme) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    enableTransition();
    setThemeState(t);
    timerRef.current = setTimeout(disableTransition, TRANSITION_DURATION + 50);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
