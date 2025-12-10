/**
 * Temporal Field Renderers
 *
 * Handles date and datetime types
 */

import chalk from 'chalk';
import { terminalCapabilities } from '../utils/terminal.js';

/**
 * Format date values
 * Reuses logic from frontend-patterns
 */
export function formatDate(
  value: string | Date,
  includeTime = false,
  locale = 'en-US'
): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (isNaN(date.getTime())) {
    return String(value);
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    options.hour = 'numeric';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return date.toLocaleDateString(locale, options);
}

/**
 * Render date value with gray color
 */
export function renderDate(
  value: unknown,
  options?: { locale?: string }
): string {
  const formatted = formatDate(
    value as string | Date,
    false,
    options?.locale ?? 'en-US'
  );
  return terminalCapabilities.color ? chalk.gray(formatted) : formatted;
}

/**
 * Render datetime value with gray color
 */
export function renderDatetime(
  value: unknown,
  options?: { locale?: string }
): string {
  const formatted = formatDate(
    value as string | Date,
    true,
    options?.locale ?? 'en-US'
  );
  return terminalCapabilities.color ? chalk.gray(formatted) : formatted;
}
