/**
 * ThemeProvider Component
 *
 * Provides theme context to all components in the TUI
 */

import React, { createContext, useContext, ReactNode } from 'react'
import { ThemedChalk, createThemedChalk, type ThemeType } from '../utils/theme.js'

/**
 * Theme context type
 */
interface ThemeContextType {
  theme: ThemedChalk
}

/**
 * Theme context
 */
const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * ThemeProvider props
 */
export interface ThemeProviderProps {
  children: ReactNode
  themeType?: ThemeType
}

/**
 * ThemeProvider component
 */
export function ThemeProvider({ children, themeType = 'auto' }: ThemeProviderProps) {
  const theme = createThemedChalk(themeType)

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme
 */
export function useTheme(): ThemedChalk {
  const context = useContext(ThemeContext)

  if (!context) {
    // Fallback to auto theme if provider not found
    // This allows components to work outside provider during testing
    return createThemedChalk('auto')
  }

  return context.theme
}
