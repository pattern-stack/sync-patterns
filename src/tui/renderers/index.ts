/**
 * Terminal Field Renderer Registry
 *
 * Maps UIType to terminal output functions for all 19 UITypes.
 * Adapts field rendering for ANSI terminal output with color and unicode support.
 */

// Import all renderer functions
import { renderText, renderPassword, renderEmail, renderUrl, renderPhone } from './text.js';
import { renderNumber, renderMoney, renderPercent } from './numeric.js';
import { renderDate, renderDatetime } from './temporal.js';
import { renderBadge, renderStatus, renderBoolean, renderRating, renderColor } from './visual.js';
import { renderEntity, renderUser } from './reference.js';
import { renderJson, renderFile, renderImage } from './data.js';

/**
 * UIType enum matching frontend-patterns
 */
export type UIType =
  | 'text'
  | 'password'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'phone'
  | 'boolean'
  | 'badge'
  | 'status'
  | 'entity'
  | 'user'
  | 'json'
  | 'image'
  | 'rating'
  | 'color'
  | 'file';

/**
 * Field format options
 */
export interface FieldFormat {
  // Money options
  currency?: string;
  decimals?: number;
  locale?: string;

  // Status options
  statusColors?: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'>;

  // Entity options
  entityType?: 'customer' | 'company' | 'vendor' | 'partner' | 'product' | 'order' | 'contact';

  // Rating options
  max?: number;

  // JSON options
  maxLength?: number;
  indent?: number;

  // File options
  filename?: string;
  size?: number;

  // User options
  showInitials?: boolean;

  // Entity options
  showIcon?: boolean;

  // Image options
  showUrl?: boolean;

  // Badge options
  color?: string;
}

/**
 * Field renderer function type
 */
export type FieldRenderer = (value: unknown, options?: FieldFormat) => string;

/**
 * Field renderer registry mapping UIType to renderer function
 */
export const fieldRenderers: Record<UIType, FieldRenderer> = {
  // Text types
  text: renderText,
  password: renderPassword,
  email: renderEmail,
  url: renderUrl,
  phone: renderPhone,

  // Numeric types
  number: renderNumber,
  money: renderMoney,
  percent: renderPercent,

  // Temporal types
  date: renderDate,
  datetime: renderDatetime,

  // Visual types
  boolean: renderBoolean,
  badge: renderBadge,
  status: renderStatus,
  rating: renderRating,
  color: renderColor,

  // Reference types
  entity: renderEntity,
  user: renderUser,

  // Data types
  json: renderJson,
  image: renderImage,
  file: renderFile,
};

/**
 * Main field rendering function
 *
 * @param value - The value to render
 * @param uiType - The UIType of the field
 * @param options - Optional format options
 * @returns Formatted string for terminal output
 *
 * @example
 * ```ts
 * renderField(1234.56, 'money', { currency: 'USD' })
 * // => "$1,234.56" (in green)
 *
 * renderField('active', 'status')
 * // => "● Active" (in green)
 *
 * renderField(4.5, 'rating', { max: 5 })
 * // => "★★★★☆" (in yellow)
 * ```
 */
export function renderField(
  value: unknown,
  uiType: UIType | string,
  options?: FieldFormat
): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '(empty)';
  }

  // Get renderer for type
  const renderer = fieldRenderers[uiType as UIType];

  if (!renderer) {
    // Graceful fallback for unknown types
    console.warn(`Unknown UIType: ${uiType}, falling back to toString()`);
    return String(value);
  }

  try {
    return renderer(value, options);
  } catch (error) {
    // Graceful error handling
    console.error(`Error rendering field of type ${uiType}:`, error);
    return String(value);
  }
}

// Re-export individual renderers for testing
export {
  // Text renderers
  renderText,
  renderPassword,
  renderEmail,
  renderUrl,
  renderPhone,

  // Numeric renderers
  renderNumber,
  renderMoney,
  renderPercent,

  // Temporal renderers
  renderDate,
  renderDatetime,

  // Visual renderers
  renderBadge,
  renderStatus,
  renderBoolean,
  renderRating,
  renderColor,

  // Reference renderers
  renderEntity,
  renderUser,

  // Data renderers
  renderJson,
  renderImage,
  renderFile,
};

// Re-export formatters for reuse
export { formatMoney, formatPercent, formatNumber } from './numeric.js';
export { formatDate } from './temporal.js';
