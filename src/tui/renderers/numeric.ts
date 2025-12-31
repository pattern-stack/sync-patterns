/**
 * Numeric Field Renderers
 *
 * Handles number, money, and percent types
 */

import { terminalCapabilities } from '../utils/terminal.js';
import { themedChalk } from '../utils/theme.js';

/**
 * Format money values
 * Reuses logic from frontend-patterns
 */
export function formatMoney(
  value: number,
  currency = 'USD',
  decimals = 2,
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format percentage values
 * Backend sends percentages as whole numbers (45 = 45%)
 */
export function formatPercent(
  value: number,
  decimals = 1,
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format number values with thousand separators
 */
export function formatNumber(
  value: number,
  decimals?: number,
  locale = 'en-US'
): string {
  const options: Intl.NumberFormatOptions = {};
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Render money value with success color
 */
export function renderMoney(
  value: unknown,
  options?: { currency?: string; decimals?: number; locale?: string }
): string {
  const formatted = formatMoney(
    Number(value),
    options?.currency ?? 'USD',
    options?.decimals ?? 2,
    options?.locale ?? 'en-US'
  );
  return terminalCapabilities.color ? themedChalk.success(formatted) : formatted;
}

/**
 * Render percentage value
 */
export function renderPercent(
  value: unknown,
  options?: { decimals?: number; locale?: string }
): string {
  return formatPercent(
    Number(value),
    options?.decimals ?? 1,
    options?.locale ?? 'en-US'
  );
}

/**
 * Render number value with thousand separators
 */
export function renderNumber(
  value: unknown,
  options?: { decimals?: number; locale?: string }
): string {
  return formatNumber(
    Number(value),
    options?.decimals,
    options?.locale ?? 'en-US'
  );
}
