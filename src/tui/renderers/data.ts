/**
 * Data Field Renderers
 *
 * Handles json, file, and image types
 */

import chalk from 'chalk';
import { terminalCapabilities } from '../utils/terminal.js';

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Render JSON with syntax highlighting and truncation
 */
export function renderJson(
  value: unknown,
  options?: { maxLength?: number; indent?: number }
): string {
  const maxLength = options?.maxLength ?? 100;
  const indent = options?.indent ?? 2;

  const str = typeof value === 'object'
    ? JSON.stringify(value, null, indent)
    : String(value);

  const truncated = str.length > maxLength
    ? str.slice(0, maxLength) + '...'
    : str;

  if (!terminalCapabilities.color) {
    return truncated;
  }

  // Simple syntax highlighting
  return truncated
    .replace(/"([^"]+)":/g, chalk.blue('"$1"') + ':') // Keys
    .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"')) // String values
    .replace(/: (\d+)/g, ': ' + chalk.yellow('$1')) // Number values
    .replace(/: (true|false|null)/g, ': ' + chalk.magenta('$1')); // Boolean/null values
}

/**
 * Render file with name and size
 */
export function renderFile(
  value: unknown,
  options?: { filename?: string; size?: number }
): string {
  const url = String(value);
  const filename = options?.filename ?? url.split('/').pop() ?? 'file';
  const size = options?.size ? ` (${formatBytes(options.size)})` : '';

  if (!terminalCapabilities.color) {
    return `${filename}${size}`;
  }

  return `${chalk.blue(filename)}${chalk.gray(size)}`;
}

/**
 * Render image (show URL since terminals can't display images)
 */
export function renderImage(
  value: unknown,
  options?: { showUrl?: boolean }
): string {
  const url = String(value);
  const filename = url.split('/').pop() ?? 'image';

  if (options?.showUrl === false) {
    return filename;
  }

  if (!terminalCapabilities.color) {
    return `[Image: ${filename}]`;
  }

  return chalk.gray(`[Image: ${chalk.cyan(filename)}]`);
}
