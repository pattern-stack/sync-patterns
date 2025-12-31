/**
 * Field Renderer Generator
 *
 * Generates the UIType → React component mapping.
 * Maps all 19 UITypes to their corresponding rendering functions.
 * This is mostly static code but generated to ensure consistency with column types.
 */

export interface GeneratedFieldRenderers {
  /** Main renderers file content */
  renderers: string
  /** Barrel export file content */
  index: string
}

export interface FieldRendererGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
  /** Frontend patterns package name (default: '@pattern-stack/frontend-patterns') */
  frontendPackage?: string
}

const DEFAULT_OPTIONS: Required<FieldRendererGeneratorOptions> = {
  includeJSDoc: true,
  frontendPackage: '@pattern-stack/frontend-patterns',
}

export class FieldRendererGenerator {
  private options: Required<FieldRendererGeneratorOptions>

  constructor(options: FieldRendererGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(): GeneratedFieldRenderers {
    return {
      renderers: this.generateRenderersFile(),
      index: this.generateIndexFile(),
    }
  }

  /**
   * Generate the main field renderers file
   */
  private generateRenderersFile(): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader())
    lines.push('')

    // Imports
    lines.push("import type { ReactNode } from 'react'")
    lines.push("import type { ColumnMetadata, UIType } from '../columns/types.js'")
    lines.push('')

    // Import frontend-patterns components
    lines.push(`// Import primitives from frontend-patterns`)
    lines.push(`// These imports should be updated based on your frontend-patterns package structure`)
    lines.push(`import {`)
    lines.push(`  DataBadge,`)
    lines.push(`  UserAvatar,`)
    lines.push(`  // DateTime,  // Uncomment when available`)
    lines.push(`  // Currency,  // Uncomment when available`)
    lines.push(`  // Rating,    // Uncomment when available`)
    lines.push(`} from '${this.options.frontendPackage}'`)
    lines.push('')

    // FieldRenderer type
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Function signature for field renderers')
      lines.push(' */')
    }
    lines.push('export type FieldRenderer = (')
    lines.push('  value: unknown,')
    lines.push('  format?: Record<string, unknown>,')
    lines.push('  column?: ColumnMetadata')
    lines.push(') => ReactNode')
    lines.push('')

    // FieldRendererMap type
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Complete mapping of UIType to renderer function')
      lines.push(' */')
    }
    lines.push('export type FieldRendererMap = Record<UIType, FieldRenderer>')
    lines.push('')

    // Helper functions
    lines.push('// =============================================================================')
    lines.push('// FORMATTING HELPERS')
    lines.push('// =============================================================================')
    lines.push('')

    // formatNumber helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Format a number with optional decimal places')
      lines.push(' */')
    }
    lines.push('function formatNumber(value: unknown, format?: Record<string, unknown>): string {')
    lines.push('  const num = typeof value === "number" ? value : parseFloat(String(value))')
    lines.push('  if (isNaN(num)) return String(value ?? "")')
    lines.push('  const decimals = typeof format?.decimals === "number" ? format.decimals : 0')
    lines.push('  return num.toLocaleString(undefined, {')
    lines.push('    minimumFractionDigits: decimals,')
    lines.push('    maximumFractionDigits: decimals,')
    lines.push('  })')
    lines.push('}')
    lines.push('')

    // formatCurrency helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Format a monetary value with currency')
      lines.push(' */')
    }
    lines.push('function formatCurrency(value: unknown, format?: Record<string, unknown>): string {')
    lines.push('  const num = typeof value === "number" ? value : parseFloat(String(value))')
    lines.push('  if (isNaN(num)) return String(value ?? "")')
    lines.push('  const currency = (format?.currency as string) ?? "USD"')
    lines.push('  const decimals = typeof format?.decimals === "number" ? format.decimals : 2')
    lines.push('  return num.toLocaleString(undefined, {')
    lines.push('    style: "currency",')
    lines.push('    currency,')
    lines.push('    minimumFractionDigits: decimals,')
    lines.push('    maximumFractionDigits: decimals,')
    lines.push('  })')
    lines.push('}')
    lines.push('')

    // formatPercent helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Format a decimal as percentage (0.45 → "45%")')
      lines.push(' */')
    }
    lines.push('function formatPercent(value: unknown, format?: Record<string, unknown>): string {')
    lines.push('  const num = typeof value === "number" ? value : parseFloat(String(value))')
    lines.push('  if (isNaN(num)) return String(value ?? "")')
    lines.push('  const decimals = typeof format?.decimals === "number" ? format.decimals : 1')
    lines.push('  return (num * 100).toFixed(decimals) + "%"')
    lines.push('}')
    lines.push('')

    // formatDate helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Format a date value')
      lines.push(' */')
    }
    lines.push('function formatDate(value: unknown, includeTime = false): string {')
    lines.push('  if (!value) return ""')
    lines.push('  const date = value instanceof Date ? value : new Date(String(value))')
    lines.push('  if (isNaN(date.getTime())) return String(value)')
    lines.push('  return includeTime')
    lines.push('    ? date.toLocaleString()')
    lines.push('    : date.toLocaleDateString()')
    lines.push('}')
    lines.push('')

    // Main field renderers map
    lines.push('// =============================================================================')
    lines.push('// FIELD RENDERERS')
    lines.push('// =============================================================================')
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Default field renderers for all 19 UITypes')
      lines.push(' * Override individual renderers via RendererProvider if needed.')
      lines.push(' */')
    }
    lines.push('export const fieldRenderers: FieldRendererMap = {')
    lines.push('  // Text (2 types)')
    lines.push('  text: (value) => (')
    lines.push('    <span className="truncate">{String(value ?? "")}</span>')
    lines.push('  ),')
    lines.push('  password: () => (')
    lines.push('    <span className="font-mono">••••••••</span>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Numbers (3 types)')
    lines.push('  number: (value, format) => (')
    lines.push('    <span className="tabular-nums">{formatNumber(value, format)}</span>')
    lines.push('  ),')
    lines.push('  money: (value, format) => (')
    lines.push('    <span className="tabular-nums font-medium">{formatCurrency(value, format)}</span>')
    lines.push('  ),')
    lines.push('  percent: (value, format) => (')
    lines.push('    <span className="tabular-nums">{formatPercent(value, format)}</span>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Dates (2 types)')
    lines.push('  date: (value) => (')
    lines.push('    <span>{formatDate(value, false)}</span>')
    lines.push('  ),')
    lines.push('  datetime: (value) => (')
    lines.push('    <span>{formatDate(value, true)}</span>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Links (3 types)')
    lines.push('  email: (value) => (')
    lines.push('    <a')
    lines.push('      href={`mailto:${String(value ?? "")}`}')
    lines.push('      className="text-primary hover:underline"')
    lines.push('    >')
    lines.push('      {String(value ?? "")}')
    lines.push('    </a>')
    lines.push('  ),')
    lines.push('  url: (value) => (')
    lines.push('    <a')
    lines.push('      href={String(value ?? "")}')
    lines.push('      target="_blank"')
    lines.push('      rel="noopener noreferrer"')
    lines.push('      className="text-primary hover:underline"')
    lines.push('    >')
    lines.push('      {String(value ?? "")}')
    lines.push('    </a>')
    lines.push('  ),')
    lines.push('  phone: (value) => (')
    lines.push('    <a')
    lines.push('      href={`tel:${String(value ?? "")}`}')
    lines.push('      className="text-primary hover:underline"')
    lines.push('    >')
    lines.push('      {String(value ?? "")}')
    lines.push('    </a>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Boolean (1 type)')
    lines.push('  boolean: (value) => (')
    lines.push('    <span>{value ? "Yes" : "No"}</span>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Visual Chips (2 types)')
    lines.push('  badge: (value) => (')
    lines.push('    <DataBadge variant="category">{String(value ?? "")}</DataBadge>')
    lines.push('  ),')
    lines.push('  status: (value) => (')
    lines.push('    <DataBadge variant="status">{String(value ?? "")}</DataBadge>')
    lines.push('  ),')
    lines.push('')
    lines.push('  // Entity References (2 types)')
    lines.push('  entity: (value) => {')
    lines.push('    // Entity reference - expects { id, name } or similar')
    lines.push('    const entity = value as { id?: string; name?: string } | null')
    lines.push('    return <span>{entity?.name ?? entity?.id ?? ""}</span>')
    lines.push('  },')
    lines.push('  user: (value) => {')
    lines.push('    // User reference - expects { id, name, avatar? } or similar')
    lines.push('    const user = value as { id?: string; name?: string; avatar?: string } | null')
    lines.push('    if (!user) return null')
    lines.push('    return <UserAvatar user={user} size="sm" showName />')
    lines.push('  },')
    lines.push('')
    lines.push('  // Special (5 types)')
    lines.push('  json: (value) => (')
    lines.push('    <pre className="text-xs font-mono bg-muted p-1 rounded max-w-xs overflow-hidden">')
    lines.push('      {JSON.stringify(value, null, 2)}')
    lines.push('    </pre>')
    lines.push('  ),')
    lines.push('  image: (value) => (')
    lines.push('    <img')
    lines.push('      src={String(value ?? "")}')
    lines.push('      alt=""')
    lines.push('      className="w-10 h-10 rounded object-cover"')
    lines.push('    />')
    lines.push('  ),')
    lines.push('  rating: (value, format) => {')
    lines.push('    const rating = typeof value === "number" ? value : parseFloat(String(value)) || 0')
    lines.push('    const max = typeof format?.max === "number" ? format.max : 5')
    lines.push('    const stars = "★".repeat(Math.round(rating)) + "☆".repeat(max - Math.round(rating))')
    lines.push('    return <span className="text-yellow-500">{stars}</span>')
    lines.push('  },')
    lines.push('  color: (value) => (')
    lines.push('    <div className="flex items-center gap-2">')
    lines.push('      <div')
    lines.push('        className="w-4 h-4 rounded border"')
    lines.push('        style={{ backgroundColor: String(value ?? "#ccc") }}')
    lines.push('      />')
    lines.push('      <span className="font-mono text-xs">{String(value ?? "")}</span>')
    lines.push('    </div>')
    lines.push('  ),')
    lines.push('  file: (value) => {')
    lines.push('    const file = value as { name?: string; size?: number; url?: string } | string | null')
    lines.push('    if (!file) return null')
    lines.push('    const name = typeof file === "string" ? file : file.name ?? "File"')
    lines.push('    return <span className="text-primary hover:underline cursor-pointer">{name}</span>')
    lines.push('  },')
    lines.push('}')
    lines.push('')

    // renderField helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Render any field value using its column metadata')
      lines.push(' * Falls back to text renderer if type is unknown.')
      lines.push(' *')
      lines.push(' * @param value - The field value to render')
      lines.push(' * @param column - Column metadata with type and format info')
      lines.push(' * @param overrides - Optional renderer overrides')
      lines.push(' */')
    }
    lines.push('export function renderField(')
    lines.push('  value: unknown,')
    lines.push('  column: ColumnMetadata,')
    lines.push('  overrides?: Partial<FieldRendererMap>')
    lines.push('): ReactNode {')
    lines.push('  const renderers = overrides ? { ...fieldRenderers, ...overrides } : fieldRenderers')
    lines.push('  const renderer = renderers[column.type] ?? renderers.text')
    lines.push('  return renderer(value, column.format, column)')
    lines.push('}')
    lines.push('')

    // renderFieldByType helper
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Render a field value by UIType directly (without full column metadata)')
      lines.push(' *')
      lines.push(' * @param value - The field value to render')
      lines.push(' * @param type - The UIType to use for rendering')
      lines.push(' * @param format - Optional format hints')
      lines.push(' */')
    }
    lines.push('export function renderFieldByType(')
    lines.push('  value: unknown,')
    lines.push('  type: UIType,')
    lines.push('  format?: Record<string, unknown>')
    lines.push('): ReactNode {')
    lines.push('  const renderer = fieldRenderers[type] ?? fieldRenderers.text')
    lines.push('  return renderer(value, format)')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate barrel export file
   */
  private generateIndexFile(): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader())
    lines.push('')
    lines.push("export * from './field-renderers.js'")
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate file header comment
   */
  private generateFileHeader(): string {
    return `/**
 * Field Renderers
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 *
 * Maps UIType to React rendering functions.
 */`
  }
}

/**
 * Factory function for generating field renderers
 */
export function generateFieldRenderers(
  options?: FieldRendererGeneratorOptions
): GeneratedFieldRenderers {
  const generator = new FieldRendererGenerator(options)
  return generator.generate()
}
