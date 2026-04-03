import { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext(null);
const THEME_KEY = "swiftserve_theme";

const themes = {
  dark: {
    "--bg-primary": "#0a0f1e",
    "--bg-secondary": "rgba(255,255,255,0.04)",
    "--bg-tertiary": "rgba(255,255,255,0.06)",
    "--bg-input": "rgba(255,255,255,0.05)",
    "--bg-solid": "#141b2d",
    "--border": "rgba(255,255,255,0.08)",
    "--border-light": "rgba(255,255,255,0.12)",
    "--glass": "rgba(255,255,255,0.03)",
    "--glass-border": "rgba(255,255,255,0.08)",
    "--shadow": "0 8px 32px rgba(0,0,0,0.4)",
    "--shadow-sm": "0 2px 12px rgba(0,0,0,0.3)",
    "--text-primary": "#f1f5f9",
    "--text-secondary": "#e2e8f0",
    "--text-muted": "#94a3b8",
    "--text-dim": "#64748b",
    "--accent": "#38bdf8",
    "--accent-blue": "#3b82f6",
    "--accent-indigo": "#6366f1",
    "--success": "#22c55e",
    "--success-light": "#4ade80",
    "--error": "#ef4444",
    "--error-light": "#f87171",
    "--error-bg": "#fca5a5",
    "--warning": "#f59e0b",
    "--warning-light": "#facc15",
    "--scrollbar": "#475569",
    "--receipt-bg": "#ffffff",
    "--receipt-text": "#111827",
  },
  light: {
    "--bg-primary": "#f0f2f5",
    "--bg-secondary": "rgba(255,255,255,0.7)",
    "--bg-tertiary": "rgba(255,255,255,0.5)",
    "--bg-input": "rgba(255,255,255,0.8)",
    "--bg-solid": "#ffffff",
    "--border": "rgba(0,0,0,0.08)",
    "--border-light": "rgba(0,0,0,0.05)",
    "--glass": "rgba(255,255,255,0.6)",
    "--glass-border": "rgba(0,0,0,0.06)",
    "--shadow": "0 8px 32px rgba(0,0,0,0.08)",
    "--shadow-sm": "0 2px 12px rgba(0,0,0,0.06)",
    "--text-primary": "#0f172a",
    "--text-secondary": "#1e293b",
    "--text-muted": "#64748b",
    "--text-dim": "#94a3b8",
    "--accent": "#0284c7",
    "--accent-blue": "#2563eb",
    "--accent-indigo": "#4f46e5",
    "--success": "#16a34a",
    "--success-light": "#22c55e",
    "--error": "#dc2626",
    "--error-light": "#ef4444",
    "--error-bg": "#fee2e2",
    "--warning": "#d97706",
    "--warning-light": "#f59e0b",
    "--scrollbar": "#cbd5e1",
    "--receipt-bg": "#ffffff",
    "--receipt-text": "#111827",
  },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");

  useEffect(() => {
    const root = document.documentElement;
    const vars = themes[theme];
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
