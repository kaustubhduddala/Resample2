"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "Resample2-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await invoke<string>("load_settings");
        const parsedSettings = JSON.parse(settings);
        if (parsedSettings.theme) {
          setTheme(parsedSettings.theme);
        }
      } catch (error) {
        // Remove console.error statement
      }
    };

    loadTheme();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      setTheme(theme);

      // Save theme to settings
      invoke("load_settings")
        .then((settingsStr: unknown) => {
          const settings = JSON.parse(settingsStr as string);
          settings.theme = theme;
          invoke("save_settings", { settings: JSON.stringify(settings) });
        })
        .catch((_error) => {
          // Remove console.error statement
        });
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
