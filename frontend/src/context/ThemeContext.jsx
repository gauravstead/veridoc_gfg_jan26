import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    // Check localStorage or system preference
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            if (saved) return saved;
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        console.log("ThemeContext: Applying theme:", theme); // DEBUG LOG
        if (theme === 'dark') {
            root.classList.add('dark');
            console.log("ThemeContext: Added 'dark' class. ClassList:", root.classList.toString());
        } else {
            root.classList.remove('dark');
            console.log("ThemeContext: Removed 'dark' class. ClassList:", root.classList.toString());
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
