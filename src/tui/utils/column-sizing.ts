/**
 * Column Sizing Utilities
 *
 * Determines optimal column widths based on UIType and content.
 * Ported from frontend-patterns field-detection logic.
 */

import type { UIType } from '../renderers/index.js'

/**
 * Default field name to UI type mappings
 * Ported from frontend-patterns/src/atoms/utils/field-detection.ts
 */
const DEFAULT_FIELD_MAPPINGS: Record<string, UIType> = {
  // Status fields
  status: 'status',
  state: 'status',
  orderStatus: 'status',
  paymentStatus: 'status',

  // Badge fields (categories, tags, labels)
  category: 'badge',
  type: 'badge',
  tag: 'badge',
  label: 'badge',

  // Money fields
  amount: 'money',
  price: 'money',
  cost: 'money',
  total: 'money',
  subtotal: 'money',
  balance: 'money',
  revenue: 'money',
  profit: 'money',
  value: 'money',
  deal_value: 'money',
  expected_value: 'money',

  // User fields (actual system users)
  user: 'user',
  userId: 'user',
  user_id: 'user',
  assignee: 'user',
  owner: 'user',
  owner_id: 'user',
  createdBy: 'user',
  created_by: 'user',
  updatedBy: 'user',
  updated_by: 'user',

  // Entity fields (business entities - not system users)
  customer: 'entity',
  vendor: 'entity',
  supplier: 'entity',
  partner: 'entity',
  client: 'entity',
  company: 'entity',
  organization: 'entity',
  account: 'entity',
  contact: 'entity',

  // Date fields
  date: 'date',
  createdAt: 'datetime',
  created_at: 'datetime',
  updatedAt: 'datetime',
  updated_at: 'datetime',
  timestamp: 'datetime',
  postedDate: 'date',
  publishedDate: 'date',
  dueDate: 'date',
  due_date: 'date',
  startDate: 'date',
  start_date: 'date',
  endDate: 'date',
  end_date: 'date',
  birthDate: 'date',
  expiryDate: 'date',
  expected_close_date: 'date',
  close_date: 'date',
  lastLogin: 'datetime',
  lastSeen: 'datetime',

  // Percentage fields
  percentage: 'percent',
  rate: 'percent',
  discount: 'percent',
  tax: 'percent',
  probability: 'percent',
  win_probability: 'percent',

  // Contact fields
  email: 'email',
  phone: 'phone',
  phoneNumber: 'phone',
  phone_number: 'phone',
  mobile: 'phone',

  // URL fields
  url: 'url',
  website: 'url',
  link: 'url',

  // ID fields
  id: 'text',
}

/**
 * Pattern-based field detection rules
 */
const FIELD_PATTERNS: Array<{ pattern: RegExp; type: UIType }> = [
  { pattern: /^is[A-Z_]/, type: 'boolean' },
  { pattern: /_at$/, type: 'datetime' },
  { pattern: /date/i, type: 'date' },
  { pattern: /time/i, type: 'datetime' },
  { pattern: /^(created|updated|deleted|modified|posted|published)$/, type: 'datetime' },
  { pattern: /price|cost|fee|amount|total|balance|revenue|profit|value/, type: 'money' },
  { pattern: /percent|rate|probability/, type: 'percent' },
  { pattern: /status|state|stage/, type: 'status' },
  { pattern: /category|type|tag|label/, type: 'badge' },
  { pattern: /email/i, type: 'email' },
  { pattern: /phone|mobile|tel/i, type: 'phone' },
  { pattern: /url|link|website/i, type: 'url' },
  { pattern: /_id$/, type: 'entity' }, // foreign key references
]

/**
 * Common status values for detection
 */
const STATUS_VALUES = new Set([
  'pending', 'completed', 'failed', 'active', 'inactive',
  'draft', 'published', 'archived', 'deleted',
  'open', 'closed', 'resolved', 'cancelled',
  'approved', 'rejected', 'processing', 'scheduled',
  'new', 'qualified', 'proposal', 'negotiation', 'won', 'lost',
])

/**
 * UUID pattern for detection
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ideal column widths for each UIType (in characters)
 * These are "ideal" widths - actual may be adjusted based on terminal size
 */
export const UI_TYPE_WIDTHS: Record<UIType, { min: number; ideal: number; max: number }> = {
  // Text types - variable width
  text: { min: 10, ideal: 25, max: 40 },
  password: { min: 8, ideal: 12, max: 12 },

  // Numeric types - fixed width
  number: { min: 6, ideal: 10, max: 15 },
  money: { min: 10, ideal: 14, max: 18 },
  percent: { min: 6, ideal: 8, max: 10 },

  // Temporal types - fixed width
  date: { min: 10, ideal: 12, max: 12 },
  datetime: { min: 16, ideal: 18, max: 20 },

  // Links - variable width
  email: { min: 15, ideal: 25, max: 35 },
  url: { min: 15, ideal: 30, max: 50 },
  phone: { min: 12, ideal: 15, max: 18 },

  // Boolean - narrow
  boolean: { min: 3, ideal: 5, max: 8 },

  // Visual - narrow to medium
  badge: { min: 8, ideal: 12, max: 18 },
  status: { min: 8, ideal: 14, max: 18 },
  rating: { min: 5, ideal: 7, max: 10 },
  color: { min: 8, ideal: 10, max: 15 },

  // References - medium width
  entity: { min: 10, ideal: 20, max: 30 },
  user: { min: 10, ideal: 18, max: 25 },

  // Data - variable
  json: { min: 15, ideal: 30, max: 50 },
  image: { min: 8, ideal: 12, max: 20 },
  file: { min: 12, ideal: 20, max: 30 },
}

/**
 * Check if a string is an ISO date
 */
function isISODate(value: string): boolean {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return !isNaN(date.getTime()) && value.includes('-')
}

/**
 * Check if a string is a UUID
 */
function isUUID(value: string): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * Detect field type from value
 */
function detectFieldTypeFromValue(fieldValue: unknown): UIType | null {
  if (fieldValue === null || fieldValue === undefined) return null

  if (typeof fieldValue === 'boolean') return 'boolean'

  if (typeof fieldValue === 'string') {
    // Check status values
    if (STATUS_VALUES.has(fieldValue.toLowerCase())) return 'status'

    // Check UUID (likely a foreign key reference)
    if (isUUID(fieldValue)) return 'entity'

    // Check date/datetime
    if (isISODate(fieldValue)) {
      return fieldValue.includes('T') || fieldValue.includes(' ') ? 'datetime' : 'date'
    }

    // Check email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue)) return 'email'

    // Check URL
    if (/^https?:\/\//.test(fieldValue) || /^www\./.test(fieldValue)) return 'url'

    // Check phone
    const cleaned = fieldValue.replace(/[\s\-().]/g, '')
    if (/^\+?\d{10,}$/.test(cleaned)) return 'phone'
  }

  if (typeof fieldValue === 'number') {
    // If it has decimals and is in reasonable money range
    if (fieldValue.toString().includes('.') && fieldValue > 0 && fieldValue < 10000000) {
      return 'money'
    }

    // If it's between 0 and 1, might be percentage (backend sends as decimal)
    if (fieldValue >= 0 && fieldValue <= 1) {
      return 'percent'
    }

    return 'number'
  }

  return null
}

/**
 * Get UIType for a field based on name and optional value
 *
 * @param fieldName - The field/column name
 * @param value - Optional sample value for inference
 * @returns The detected UIType
 */
export function inferUIType(fieldName: string, value?: unknown): UIType {
  // 1. Check exact name matches (case-insensitive)
  const lowerFieldName = fieldName.toLowerCase()
  for (const [key, type] of Object.entries(DEFAULT_FIELD_MAPPINGS)) {
    if (key.toLowerCase() === lowerFieldName) {
      return type
    }
  }

  // 2. Check patterns
  for (const { pattern, type } of FIELD_PATTERNS) {
    if (pattern.test(fieldName)) {
      return type
    }
  }

  // 3. Try to detect from value
  if (value !== undefined) {
    const detectedType = detectFieldTypeFromValue(value)
    if (detectedType) return detectedType
  }

  // 4. Default fallback
  return 'text'
}

/**
 * Calculate optimal column widths based on UITypes and available space
 *
 * @param columns - Array of columns with their UITypes
 * @param terminalWidth - Available terminal width
 * @param padding - Padding per column (default 2)
 * @returns Array of calculated widths
 */
export function calculateColumnWidths(
  columns: Array<{ key: string; uiType: UIType }>,
  terminalWidth: number,
  padding = 2
): number[] {
  if (columns.length === 0) return []

  // Reserve space for borders and padding
  const totalPadding = columns.length * padding
  const availableWidth = terminalWidth - totalPadding - 4 // extra margin

  // Get ideal widths for each column
  const idealWidths = columns.map(col => UI_TYPE_WIDTHS[col.uiType]?.ideal ?? 15)
  const minWidths = columns.map(col => UI_TYPE_WIDTHS[col.uiType]?.min ?? 8)
  const maxWidths = columns.map(col => UI_TYPE_WIDTHS[col.uiType]?.max ?? 40)

  const totalIdeal = idealWidths.reduce((a, b) => a + b, 0)

  // If we have enough space, use ideal widths
  if (totalIdeal <= availableWidth) {
    // Distribute extra space proportionally to max widths
    const extraSpace = availableWidth - totalIdeal
    const totalMaxExtra = maxWidths.map((max, i) => max - (idealWidths[i] ?? 15)).reduce((a, b) => a + b, 0)

    if (totalMaxExtra > 0 && extraSpace > 0) {
      return idealWidths.map((ideal, i) => {
        const maxWidth = maxWidths[i] ?? 40
        const maxExtra = maxWidth - ideal
        const extra = Math.floor((maxExtra / totalMaxExtra) * extraSpace)
        return Math.min(ideal + extra, maxWidth)
      })
    }

    return idealWidths
  }

  // If we need to shrink, scale down proportionally but respect minimums
  const totalMin = minWidths.reduce((a, b) => a + b, 0)

  if (availableWidth <= totalMin) {
    // Not enough space even for minimums - use minimums
    return minWidths
  }

  // Scale between min and ideal
  const scaleFactor = (availableWidth - totalMin) / (totalIdeal - totalMin)
  return idealWidths.map((ideal, i) => {
    const min = minWidths[i] ?? 8
    return Math.floor(min + (ideal - min) * scaleFactor)
  })
}

/**
 * Truncate UUID to short form: abc...xyz
 */
export function truncateUUID(uuid: string): string {
  if (!isUUID(uuid)) return uuid
  return `${uuid.slice(0, 4)}…${uuid.slice(-4)}`
}
