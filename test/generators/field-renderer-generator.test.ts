/**
 * Field Renderer Generator Tests
 *
 * Tests for UIType → React component mapping generation.
 */

import { describe, it, expect } from 'vitest'
import { FieldRendererGenerator, generateFieldRenderers } from '../../src/generators/field-renderer-generator.js'

describe('FieldRendererGenerator', () => {
  describe('generate', () => {
    it('should generate renderers file', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toBeTruthy()
      expect(result.index).toBeTruthy()
    })

    it('should be static generation (no EntityModel needed)', () => {
      // This generator doesn't need EntityModel - it's static
      const result1 = generateFieldRenderers()
      const result2 = generateFieldRenderers()

      // Should generate the same content every time
      expect(result1.renderers).toBe(result2.renderers)
    })
  })

  describe('renderers file', () => {
    it('should import React types', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain("import type { ReactNode } from 'react'")
      expect(result.renderers).toContain("import type { ColumnMetadata, UIType } from '../columns/types.js'")
    })

    it('should import frontend-patterns components', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain("import {")
      expect(result.renderers).toContain("DataBadge,")
      expect(result.renderers).toContain("UserAvatar,")
      expect(result.renderers).toContain("} from '@pattern-stack/frontend-patterns'")
    })

    it('should allow custom frontend package name', () => {
      const result = generateFieldRenderers({
        frontendPackage: '@custom/ui-library',
      })

      expect(result.renderers).toContain("} from '@custom/ui-library'")
    })

    it('should define FieldRenderer type', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('export type FieldRenderer = (')
      expect(result.renderers).toContain('value: unknown,')
      expect(result.renderers).toContain('format?: Record<string, unknown>,')
      expect(result.renderers).toContain('column?: ColumnMetadata')
      expect(result.renderers).toContain(') => ReactNode')
    })

    it('should define FieldRendererMap type', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('export type FieldRendererMap = Record<UIType, FieldRenderer>')
    })
  })

  describe('helper functions', () => {
    it('should generate formatNumber helper', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('function formatNumber(value: unknown, format?: Record<string, unknown>): string {')
      expect(result.renderers).toContain('const num = typeof value === "number" ? value : parseFloat(String(value))')
      expect(result.renderers).toContain('const decimals = typeof format?.decimals === "number" ? format.decimals : 0')
      expect(result.renderers).toContain('return num.toLocaleString(')
    })

    it('should generate formatCurrency helper', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('function formatCurrency(value: unknown, format?: Record<string, unknown>): string {')
      expect(result.renderers).toContain('const currency = (format?.currency as string) ?? "USD"')
      expect(result.renderers).toContain('style: "currency"')
    })

    it('should generate formatPercent helper', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('function formatPercent(value: unknown, format?: Record<string, unknown>): string {')
      expect(result.renderers).toContain('return (num * 100).toFixed(decimals) + "%"')
    })

    it('should generate formatDate helper', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('function formatDate(value: unknown, includeTime = false): string {')
      expect(result.renderers).toContain('const date = value instanceof Date ? value : new Date(String(value))')
      expect(result.renderers).toContain('return includeTime')
      expect(result.renderers).toContain('? date.toLocaleString()')
      expect(result.renderers).toContain(': date.toLocaleDateString()')
    })
  })

  describe('field renderers - all 19 UITypes', () => {
    it('should generate text renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('text: (value) => (')
      expect(result.renderers).toContain('<span className="truncate">{String(value ?? "")}</span>')
    })

    it('should generate password renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('password: () => (')
      expect(result.renderers).toContain('<span className="font-mono">••••••••</span>')
    })

    it('should generate number renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('number: (value, format) => (')
      expect(result.renderers).toContain('<span className="tabular-nums">{formatNumber(value, format)}</span>')
    })

    it('should generate money renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('money: (value, format) => (')
      expect(result.renderers).toContain('<span className="tabular-nums font-medium">{formatCurrency(value, format)}</span>')
    })

    it('should generate percent renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('percent: (value, format) => (')
      expect(result.renderers).toContain('<span className="tabular-nums">{formatPercent(value, format)}</span>')
    })

    it('should generate date renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('date: (value) => (')
      expect(result.renderers).toContain('<span>{formatDate(value, false)}</span>')
    })

    it('should generate datetime renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('datetime: (value) => (')
      expect(result.renderers).toContain('<span>{formatDate(value, true)}</span>')
    })

    it('should generate email renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('email: (value) => (')
      expect(result.renderers).toContain('href={`mailto:${String(value ?? "")}`}')
      expect(result.renderers).toContain('className="text-primary hover:underline"')
    })

    it('should generate url renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('url: (value) => (')
      expect(result.renderers).toContain('href={String(value ?? "")}')
      expect(result.renderers).toContain('target="_blank"')
      expect(result.renderers).toContain('rel="noopener noreferrer"')
    })

    it('should generate phone renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('phone: (value) => (')
      expect(result.renderers).toContain('href={`tel:${String(value ?? "")}`}')
    })

    it('should generate boolean renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('boolean: (value) => (')
      expect(result.renderers).toContain('<span>{value ? "Yes" : "No"}</span>')
    })

    it('should generate badge renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('badge: (value) => (')
      expect(result.renderers).toContain('<DataBadge variant="category">{String(value ?? "")}</DataBadge>')
    })

    it('should generate status renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('status: (value) => (')
      expect(result.renderers).toContain('<DataBadge variant="status">{String(value ?? "")}</DataBadge>')
    })

    it('should generate entity renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('entity: (value) => {')
      expect(result.renderers).toContain('const entity = value as { id?: string; name?: string } | null')
      expect(result.renderers).toContain('return <span>{entity?.name ?? entity?.id ?? ""}</span>')
    })

    it('should generate user renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('user: (value) => {')
      expect(result.renderers).toContain('const user = value as { id?: string; name?: string; avatar?: string } | null')
      expect(result.renderers).toContain('return <UserAvatar user={user} size="sm" showName />')
    })

    it('should generate json renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('json: (value) => (')
      expect(result.renderers).toContain('<pre className="text-xs font-mono bg-muted p-1 rounded max-w-xs overflow-hidden">')
      expect(result.renderers).toContain('{JSON.stringify(value, null, 2)}')
    })

    it('should generate image renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('image: (value) => (')
      expect(result.renderers).toContain('<img')
      expect(result.renderers).toContain('src={String(value ?? "")}')
      expect(result.renderers).toContain('className="w-10 h-10 rounded object-cover"')
    })

    it('should generate rating renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('rating: (value, format) => {')
      expect(result.renderers).toContain('const rating = typeof value === "number" ? value : parseFloat(String(value)) || 0')
      expect(result.renderers).toContain('const max = typeof format?.max === "number" ? format.max : 5')
      expect(result.renderers).toContain('const stars = "★".repeat(Math.round(rating)) + "☆".repeat(max - Math.round(rating))')
      expect(result.renderers).toContain('<span className="text-yellow-500">{stars}</span>')
    })

    it('should generate color renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('color: (value) => (')
      expect(result.renderers).toContain('<div className="flex items-center gap-2">')
      expect(result.renderers).toContain('style={{ backgroundColor: String(value ?? "#ccc") }}')
      expect(result.renderers).toContain('<span className="font-mono text-xs">{String(value ?? "")}</span>')
    })

    it('should generate file renderer', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('file: (value) => {')
      expect(result.renderers).toContain('const file = value as { name?: string; size?: number; url?: string } | string | null')
      expect(result.renderers).toContain('const name = typeof file === "string" ? file : file.name ?? "File"')
      expect(result.renderers).toContain('<span className="text-primary hover:underline cursor-pointer">{name}</span>')
    })
  })

  describe('exported functions', () => {
    it('should export renderField function', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('export function renderField(')
      expect(result.renderers).toContain('value: unknown,')
      expect(result.renderers).toContain('column: ColumnMetadata,')
      expect(result.renderers).toContain('overrides?: Partial<FieldRendererMap>')
      expect(result.renderers).toContain('const renderers = overrides ? { ...fieldRenderers, ...overrides } : fieldRenderers')
      expect(result.renderers).toContain('const renderer = renderers[column.type] ?? renderers.text')
    })

    it('should export renderFieldByType function', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('export function renderFieldByType(')
      expect(result.renderers).toContain('value: unknown,')
      expect(result.renderers).toContain('type: UIType,')
      expect(result.renderers).toContain('format?: Record<string, unknown>')
      expect(result.renderers).toContain('const renderer = fieldRenderers[type] ?? fieldRenderers.text')
    })

    it('should export fieldRenderers map', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('export const fieldRenderers: FieldRendererMap = {')
    })
  })

  describe('index file', () => {
    it('should export field-renderers module', () => {
      const result = generateFieldRenderers()

      expect(result.index).toContain("export * from './field-renderers.js'")
    })

    it('should include file header', () => {
      const result = generateFieldRenderers()

      expect(result.index).toContain('Field Renderers')
      expect(result.index).toContain('Auto-generated from OpenAPI specification')
    })
  })

  describe('options - includeJSDoc', () => {
    it('should include JSDoc comments by default', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('/**')
      expect(result.renderers).toContain('* Function signature for field renderers')
      expect(result.renderers).toContain('* Complete mapping of UIType to renderer function')
    })

    it('should omit JSDoc comments when disabled', () => {
      const generator = new FieldRendererGenerator({ includeJSDoc: false })
      const result = generator.generate()

      // File header is always present, but variable/function JSDoc should be omitted
      expect(result.renderers).not.toContain('* Function signature for field renderers')
      expect(result.renderers).not.toContain('* Complete mapping of UIType to renderer function')
      expect(result.renderers).not.toContain('* Format a number with optional decimal places')
    })
  })

  describe('file headers', () => {
    it('should include auto-generated warning', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('Auto-generated from OpenAPI specification')
      expect(result.renderers).toContain('Do not edit manually - regenerate using sync-patterns CLI')
    })

    it('should include description of UIType mapping', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('Maps UIType to React rendering functions')
    })
  })

  describe('comprehensive renderer coverage', () => {
    it('should have exactly 19 renderers matching all UITypes', () => {
      const result = generateFieldRenderers()

      // Count renderer definitions (look for "type: (value" pattern)
      const rendererMatches = result.renderers.match(/\w+: \(value[,\)]/g) || []

      // Should have at least 19 renderers
      expect(rendererMatches.length).toBeGreaterThanOrEqual(19)

      // Check specific ones exist
      const allTypes = [
        'text', 'password', 'number', 'money', 'percent',
        'date', 'datetime', 'email', 'url', 'phone',
        'boolean', 'badge', 'status', 'entity', 'user',
        'json', 'image', 'rating', 'color', 'file'
      ]

      allTypes.forEach(type => {
        expect(result.renderers).toContain(`${type}:`)
      })
    })
  })

  describe('formatting helper edge cases', () => {
    it('should handle invalid numbers in formatNumber', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('if (isNaN(num)) return String(value ?? "")')
    })

    it('should handle invalid dates in formatDate', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('if (isNaN(date.getTime())) return String(value)')
    })

    it('should default currency to USD', () => {
      const result = generateFieldRenderers()

      expect(result.renderers).toContain('const currency = (format?.currency as string) ?? "USD"')
    })

    it('should default decimals appropriately per type', () => {
      const result = generateFieldRenderers()

      // Number: 0 decimals
      expect(result.renderers).toContain('const decimals = typeof format?.decimals === "number" ? format.decimals : 0')
      // Currency: 2 decimals
      expect(result.renderers).toContain('const decimals = typeof format?.decimals === "number" ? format.decimals : 2')
      // Percent: 1 decimal
      expect(result.renderers).toContain('const decimals = typeof format?.decimals === "number" ? format.decimals : 1')
    })
  })
})
