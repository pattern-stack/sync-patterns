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
  account: getSymbol('🏦', 'A'),
  user: getSymbol('👤', 'U'),
  default: getSymbol('📄', 'R'),
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
  options?: {
    type?: keyof typeof ENTITY_ICONS;
    showIcon?: boolean;
    displayName?: string;
    isLink?: boolean;
    isLoading?: boolean;
    notFound?: boolean;
  }
): string {
  const rawValue = String(value);
  const type = options?.type ?? 'default';
  const showIcon = options?.showIcon ?? true;
  const isLink = options?.isLink ?? false;
  const isLoading = options?.isLoading ?? false;
  const notFound = options?.notFound ?? false;

  // Use display name if provided, otherwise use raw value
  const name = options?.displayName ?? rawValue;

  // Handle loading state
  if (isLoading) {
    return chalk.dim('Loading...');
  }

  // Handle not found state (deleted/orphaned reference)
  if (notFound) {
    return chalk.dim(`(deleted) ${rawValue.slice(0, 8)}`);
  }

  // Build the display string
  let display = name;

  if (showIcon) {
    const icon = ENTITY_ICONS[type] ?? ENTITY_ICONS.default;
    display = `${icon} ${name}`;
  }

  // Add link indicator if this is a clickable link
  if (isLink) {
    display = `${display} ${chalk.cyan('→')}`;
  }

  // Color the display based on state
  if (isLink) {
    return chalk.cyan(display);
  }

  return display;
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
