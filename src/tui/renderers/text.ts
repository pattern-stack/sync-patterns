/**
 * Text Field Renderers
 *
 * Handles text, password, email, url, and phone types
 */

import chalk from 'chalk';
import { getSymbol, terminalCapabilities } from '../utils/terminal.js';

/**
 * Render plain text
 */
export function renderText(value: unknown): string {
  return String(value);
}

/**
 * Render password value masked with dots
 */
export function renderPassword(value: unknown): string {
  const length = String(value).length;
  const maskedLength = Math.min(length, 8);
  const dot = getSymbol('●', '*');
  return dot.repeat(maskedLength);
}

/**
 * Render email address
 * Could be made clickable in terminals that support OSC 8 hyperlinks
 */
export function renderEmail(value: unknown): string {
  const email = String(value);
  return terminalCapabilities.color ? chalk.cyan(email) : email;
}

/**
 * Render URL
 * Truncate display for long URLs
 */
export function renderUrl(value: unknown): string {
  const url = String(value);
  const display = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;
  const truncated = display.length > 40 ? display.slice(0, 37) + '...' : display;
  return terminalCapabilities.color ? chalk.blue.underline(truncated) : truncated;
}

/**
 * Format phone number
 * Supports US format: (555) 123-4567
 */
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  // US format
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  // US format with country code
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  // Return as-is if not recognized
  return phone;
}

/**
 * Render phone number with formatting
 */
export function renderPhone(value: unknown): string {
  return formatPhoneNumber(String(value));
}
