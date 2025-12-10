/**
 * Reference Field Renderers
 *
 * Handles entity and user types
 */

import chalk from 'chalk';
import { getSymbol, terminalCapabilities } from '../utils/terminal.js';

/**
 * Entity type icons
 */
const ENTITY_ICONS = {
  customer: getSymbol('👤', 'C'),
  company: getSymbol('🏢', 'Co'),
  vendor: getSymbol('🏪', 'V'),
  partner: getSymbol('🤝', 'P'),
  product: getSymbol('📦', 'Pr'),
  order: getSymbol('📋', 'O'),
  contact: getSymbol('📇', 'Ct'),
} as const;

/**
 * Get initials from name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Render entity reference with icon and name
 */
export function renderEntity(
  value: unknown,
  options?: { type?: keyof typeof ENTITY_ICONS; showIcon?: boolean }
): string {
  const name = String(value);
  const type = options?.type ?? 'customer';
  const showIcon = options?.showIcon ?? true;

  if (!showIcon) {
    return name;
  }

  const icon = ENTITY_ICONS[type] ?? ENTITY_ICONS.customer;
  return `${icon} ${name}`;
}

/**
 * Render user reference with initials and name
 */
export function renderUser(
  value: unknown,
  options?: { showInitials?: boolean }
): string {
  const name = String(value);
  const showInitials = options?.showInitials ?? true;

  if (!showInitials) {
    return name;
  }

  const initials = getInitials(name);

  if (!terminalCapabilities.color) {
    return `[${initials}] ${name}`;
  }

  // Use cyan background for initials badge
  const badge = chalk.bgCyan.black(` ${initials} `);
  return `${badge} ${name}`;
}
