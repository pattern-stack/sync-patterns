/**
 * Visual Field Renderers
 *
 * Handles badge, status, color, rating, and boolean types
 */

import chalk from 'chalk';
import { getSymbol, terminalCapabilities } from '../utils/terminal.js';

/**
 * Status color type
 */
export type StatusColor = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Internal color mapping for chalk
 */
type ChalkColor = 'green' | 'yellow' | 'red' | 'cyan' | 'gray';

/**
 * Status to chalk color mapping
 */
const STATUS_TO_CHALK: Record<StatusColor, ChalkColor> = {
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'cyan',
  neutral: 'gray',
};

/**
 * Default status color mapping
 */
const STATUS_COLORS: Record<string, StatusColor> = {
  active: 'success',
  success: 'success',
  completed: 'success',
  pending: 'warning',
  warning: 'warning',
  inactive: 'neutral',
  error: 'error',
  failed: 'error',
  info: 'info',
  neutral: 'neutral',
};

/**
 * Get chalk color function for status
 */
function getStatusChalk(status: StatusColor) {
  const chalkColor = STATUS_TO_CHALK[status];
  switch (chalkColor) {
    case 'green': return chalk.green;
    case 'yellow': return chalk.yellow;
    case 'red': return chalk.red;
    case 'cyan': return chalk.cyan;
    case 'gray': return chalk.gray;
    default: return chalk.white;
  }
}

/**
 * Render badge with colored text
 */
export function renderBadge(
  value: unknown,
  options?: { color?: string }
): string {
  const text = String(value);

  if (!terminalCapabilities.color) {
    return `[${text}]`;
  }

  // Cycle through chalk colors for category badges
  const colors = [chalk.blue, chalk.green, chalk.yellow, chalk.magenta, chalk.cyan, chalk.red];
  const colorFn = options?.color
    ? chalk.hex(options.color)
    : colors[text.length % colors.length] ?? chalk.blue;

  return colorFn(text);
}

/**
 * Render status with colored indicator
 */
export function renderStatus(
  value: unknown,
  options?: { statusColors?: Record<string, StatusColor> }
): string {
  const status = String(value).toLowerCase();
  const colorMap = options?.statusColors ?? STATUS_COLORS;
  const color = colorMap[status] ?? 'neutral';
  const indicator = getSymbol('●', '*');

  if (!terminalCapabilities.color) {
    return `${indicator} ${value}`;
  }

  const colorFn = getStatusChalk(color);
  return `${colorFn(indicator)} ${colorFn(String(value))}`;
}

/**
 * Render boolean with checkmark/cross
 */
export function renderBoolean(value: unknown): string {
  const isTrue = Boolean(value);
  const checkmark = getSymbol('✓', '+');
  const cross = getSymbol('✗', '-');
  const symbol = isTrue ? checkmark : cross;

  if (!terminalCapabilities.color) {
    return symbol;
  }

  return isTrue ? chalk.green(symbol) : chalk.red(symbol);
}

/**
 * Render rating with stars
 */
export function renderRating(
  value: unknown,
  options?: { max?: number }
): string {
  const rating = Number(value);
  const max = options?.max ?? 5;
  const filled = Math.round(rating);

  const filledStar = getSymbol('★', '*');
  const emptyStar = getSymbol('☆', '-');

  const stars = filledStar.repeat(Math.min(filled, max)) +
                emptyStar.repeat(Math.max(0, max - filled));

  return terminalCapabilities.color ? chalk.yellow(stars) : stars;
}

/**
 * Render color value with preview
 */
export function renderColor(value: unknown): string {
  const color = String(value);

  if (!terminalCapabilities.color) {
    return color;
  }

  // Try to render a color swatch using background color
  const swatch = '  '; // Two spaces
  try {
    return `${chalk.bgHex(color)(swatch)} ${color}`;
  } catch {
    // If color parsing fails, just return the value
    return color;
  }
}
