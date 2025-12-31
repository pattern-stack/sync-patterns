/**
 * Theme System
 *
 * Centralized color and styling configuration for the TUI.
 * Supports light, dark, and auto (terminal background detection) themes.
 */

import chalk from 'chalk'
import { terminalCapabilities } from './terminal.js'

/**
 * Color slot type (semantic colors)
 */
export interface ThemeColors {
  // Brand colors
  primary: string
  secondary: string
  accent: string

  // Semantic colors
  success: string
  warning: string
  error: string
  info: string

  // UI colors
  muted: string
  mutedForeground: string
  border: string
  borderFocus: string

  // Text colors
  foreground: string
  background: string

  // Status indicators
  statusActive: string
  statusInactive: string
  statusPending: string

  // Selection
  selection: string
  selectionForeground: string
}

/**
 * Complete theme definition
 */
export interface Theme {
  name: string
  colors: ThemeColors
}

/**
 * Dark theme (default)
 */
export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    // Brand colors - cyan/blue palette
    primary: '#00D9FF',      // Bright cyan
    secondary: '#8B5CF6',    // Purple
    accent: '#FBBF24',       // Amber

    // Semantic colors
    success: '#10B981',      // Emerald
    warning: '#F59E0B',      // Amber
    error: '#EF4444',        // Red
    info: '#3B82F6',         // Blue

    // UI colors
    muted: '#6B7280',        // Gray 500
    mutedForeground: '#9CA3AF', // Gray 400
    border: '#374151',       // Gray 700
    borderFocus: '#00D9FF',  // Primary

    // Text colors
    foreground: '#F9FAFB',   // Gray 50
    background: '#111827',   // Gray 900

    // Status indicators
    statusActive: '#10B981',  // Green
    statusInactive: '#6B7280', // Gray
    statusPending: '#F59E0B',  // Amber

    // Selection
    selection: '#00D9FF',     // Primary
    selectionForeground: '#111827', // Dark background
  },
}

/**
 * Light theme
 */
export const lightTheme: Theme = {
  name: 'light',
  colors: {
    // Brand colors - darker for light background
    primary: '#0891B2',      // Cyan 600
    secondary: '#7C3AED',    // Violet 600
    accent: '#D97706',       // Amber 600

    // Semantic colors
    success: '#059669',      // Emerald 600
    warning: '#D97706',      // Amber 600
    error: '#DC2626',        // Red 600
    info: '#2563EB',         // Blue 600

    // UI colors
    muted: '#9CA3AF',        // Gray 400
    mutedForeground: '#6B7280', // Gray 500
    border: '#D1D5DB',       // Gray 300
    borderFocus: '#0891B2',  // Primary

    // Text colors
    foreground: '#111827',   // Gray 900
    background: '#F9FAFB',   // Gray 50

    // Status indicators
    statusActive: '#059669',  // Green 600
    statusInactive: '#9CA3AF', // Gray 400
    statusPending: '#D97706',  // Amber 600

    // Selection
    selection: '#0891B2',     // Primary
    selectionForeground: '#F9FAFB', // Light background
  },
}

/**
 * Detect terminal background color (approximate)
 * Returns 'dark' or 'light'
 */
function detectTerminalBackground(): 'dark' | 'light' {
  // Check environment variables
  if (process.env.COLORFGBG) {
    // Format is "foreground;background"
    const parts = process.env.COLORFGBG.split(';')
    const bg = parseInt(parts[1] || '0', 10)

    // 0-7 are dark colors, 8-15 are light
    return bg >= 8 ? 'light' : 'dark'
  }

  // Check TERM_PROGRAM for known terminals
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
    // macOS Terminal.app defaults to light
    return 'light'
  }

  if (process.env.TERM_PROGRAM === 'iTerm.app') {
    // iTerm defaults to dark but we can't detect
    return 'dark'
  }

  // Default to dark (most developer terminals are dark)
  return 'dark'
}

/**
 * Theme type
 */
export type ThemeType = 'light' | 'dark' | 'auto'

/**
 * Get theme based on type
 */
export function getTheme(type: ThemeType): Theme {
  if (type === 'auto') {
    const detected = detectTerminalBackground()
    return detected === 'light' ? lightTheme : darkTheme
  }

  return type === 'light' ? lightTheme : darkTheme
}

/**
 * Theme-aware chalk wrapper
 * Provides themed color functions
 */
export class ThemedChalk {
  private theme: Theme

  constructor(theme: Theme) {
    this.theme = theme
  }

  /**
   * Get theme
   */
  getTheme(): Theme {
    return this.theme
  }

  /**
   * Update theme
   */
  setTheme(theme: Theme): void {
    this.theme = theme
  }

  // Brand colors
  primary(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.primary)(text) : text
  }

  secondary(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.secondary)(text) : text
  }

  accent(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.accent)(text) : text
  }

  // Semantic colors
  success(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.success)(text) : text
  }

  warning(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.warning)(text) : text
  }

  error(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.error)(text) : text
  }

  info(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.info)(text) : text
  }

  // UI colors
  muted(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.muted)(text) : text
  }

  mutedForeground(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.mutedForeground)(text) : text
  }

  border(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.border)(text) : text
  }

  borderFocus(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.borderFocus)(text) : text
  }

  // Text colors
  foreground(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.foreground)(text) : text
  }

  // Status colors
  statusActive(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.statusActive)(text) : text
  }

  statusInactive(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.statusInactive)(text) : text
  }

  statusPending(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.statusPending)(text) : text
  }

  // Selection
  selection(text: string): string {
    return terminalCapabilities.color ? chalk.hex(this.theme.colors.selection)(text) : text
  }

  selectionInverse(text: string): string {
    if (!terminalCapabilities.color) return text
    return chalk.hex(this.theme.colors.selectionForeground).bgHex(this.theme.colors.selection)(text)
  }

  // Utility methods
  dimmed(text: string): string {
    return this.muted(text)
  }

  bold(text: string): string {
    return chalk.bold(text)
  }

  inverse(text: string): string {
    return chalk.inverse(text)
  }

  // Raw chalk access for special cases
  get chalk() {
    return chalk
  }
}

/**
 * Create a themed chalk instance
 */
export function createThemedChalk(themeType: ThemeType = 'auto'): ThemedChalk {
  const theme = getTheme(themeType)
  return new ThemedChalk(theme)
}

/**
 * Default themed chalk instance
 */
export const themedChalk = createThemedChalk('auto')
