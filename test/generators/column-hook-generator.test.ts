/**
 * Column Hook Generator Tests
 *
 * Tests for TanStack Query hook generation for fetching dynamic column metadata.
 */

import { describe, it, expect } from 'vitest'
import { ColumnHookGenerator, generateColumnHooks } from '../../src/generators/column-hook-generator.js'
import type { EntityModel, EntityDefinition, ColumnMetadata } from '../../src/core/entity-model.js'
import { createEmptyEntityModel } from '../../src/core/entity-model.js'

describe('ColumnHookGenerator', () => {
  const createMockEntity = (
    name: string,
    columnMetadata?: ColumnMetadata[]
  ): EntityDefinition => ({
    name,
    singular: name.slice(0, -1), // simple singularization
    pascalName: name.charAt(0).toUpperCase() + name.slice(1, -1),
    syncMode: 'api',
    operations: {},
    customOperations: [],
    schemas: {},
    columnMetadata,
  })

  const createMockEntityModel = (entities: EntityDefinition[]): EntityModel => {
    const model = createEmptyEntityModel()
    entities.forEach((entity) => {
      model.entities.set(entity.name, entity)
    })
    return model
  }

  describe('generate', () => {
    it('should generate empty result when no entities have columnMetadata', () => {
      const model = createMockEntityModel([
        createMockEntity('accounts'),
      ])

      const result = generateColumnHooks(model)

      expect(result.hooks.size).toBe(0)
      expect(result.index).toBeTruthy()
    })

    it('should generate hook file for entity with columnMetadata', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)

      expect(result.hooks.size).toBe(1)
      expect(result.hooks.has('accounts')).toBe(true)
    })

    it('should skip entities without columnMetadata', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
        createMockEntity('users'), // no columns
      ])

      const result = generateColumnHooks(model)

      expect(result.hooks.size).toBe(1)
      expect(result.hooks.has('accounts')).toBe(true)
      expect(result.hooks.has('users')).toBe(false)
    })
  })

  describe('hook file generation', () => {
    it('should import TanStack Query', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain("import { useQuery, type UseQueryOptions } from '@tanstack/react-query'")
    })

    it('should import base columns as placeholder data', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain("import { contactBaseColumns } from '../columns/contact.columns.js'")
    })

    it('should import types and config', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain("import type { ColumnMetadataResponse } from '../columns/types.js'")
      expect(accountCode).toContain("import { getApiUrl, getAuthToken } from '../config.js'")
    })
  })

  describe('query defaults', () => {
    it('should define aggressive caching defaults', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain('const columnQueryDefaults = {')
      expect(contactCode).toContain('staleTime: 1000 * 60 * 30,      // 30 minutes')
      expect(contactCode).toContain('gcTime: 1000 * 60 * 60 * 24,    // 24 hours')
      expect(contactCode).toContain('retry: 1,')
      expect(contactCode).toContain('refetchOnWindowFocus: false,')
      expect(contactCode).toContain('refetchOnMount: false,')
    })
  })

  describe('options interface', () => {
    it('should define UseEntityColumnsOptions interface', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('export interface UseAccountColumnsOptions {')
      expect(accountCode).toContain('includeOrg?: boolean')
      expect(accountCode).toContain('includeUser?: boolean')
      expect(accountCode).toContain('includeExternal?: string[]')
      expect(accountCode).toContain("view?: 'list' | 'detail' | 'form'")
      expect(accountCode).toContain('queryOptions?: Omit<UseQueryOptions<ColumnMetadataResponse>, "queryKey" | "queryFn" | "placeholderData">')
    })
  })

  describe('hook function', () => {
    it('should generate hook with correct name', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain('export function useContactColumns(options: UseContactColumnsOptions = {}) {')
    })

    it('should destructure options with defaults', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('const {')
      expect(accountCode).toContain('includeOrg = true,')
      expect(accountCode).toContain('includeUser = true,')
      expect(accountCode).toContain('includeExternal,')
      expect(accountCode).toContain("view = 'list',")
      expect(accountCode).toContain('queryOptions,')
      expect(accountCode).toContain('} = options')
    })

    it('should setup useQuery with correct queryKey', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain("queryKey: ['contact', 'columns', { view, includeOrg, includeUser, includeExternal }]")
    })

    it('should implement queryFn with proper URL building', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('queryFn: async (): Promise<ColumnMetadataResponse> => {')
      expect(accountCode).toContain('const params = new URLSearchParams()')
      expect(accountCode).toContain('params.set("view", view)')
      expect(accountCode).toContain('if (!includeOrg) params.set("include_org", "false")')
      expect(accountCode).toContain('if (!includeUser) params.set("include_user", "false")')
      expect(accountCode).toContain('if (includeExternal?.length) {')
      expect(accountCode).toContain('params.set("include_external", includeExternal.join(","))')
    })

    it('should build correct API URL using config functions', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      // The URL uses the actual entity name (plural), hardcoded at generation time
      expect(contactCode).toContain('const url = `${getApiUrl()}/contacts/columns?${params.toString()}`')
      expect(contactCode).toContain('getApiUrl()')
    })

    it('should use getAuthToken for authorization', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('const token = getAuthToken()')
      expect(accountCode).toContain("...(token ? { 'Authorization': `Bearer ${token}` } : {})")
    })

    it('should handle fetch errors', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain('if (!response.ok) {')
      expect(contactCode).toContain('throw new Error(`Failed to fetch column metadata: ${response.status}`)')
    })
  })

  describe('placeholder data', () => {
    it('should use base columns as placeholderData', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('placeholderData: {')
      expect(accountCode).toContain('columns: accountBaseColumns,')
      expect(accountCode).toContain("entity: 'account',")
      expect(accountCode).toContain('view,')
      expect(accountCode).toContain("version: '1.0',")
    })
  })

  describe('return value', () => {
    it('should return comprehensive hook result', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain('return {')
      expect(contactCode).toContain('columns: query.data?.columns ?? [],')
      expect(contactCode).toContain('data: query.data,')
      expect(contactCode).toContain('isLoading: query.isLoading,')
      expect(contactCode).toContain('isFetching: query.isFetching,')
      expect(contactCode).toContain('isPlaceholder: query.isPlaceholderData,')
      expect(contactCode).toContain('error: query.error,')
      expect(contactCode).toContain('refetch: query.refetch,')
    })
  })

  describe('index file generation', () => {
    it('should export hooks in sorted order', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
        createMockEntity('accounts', columns),
        createMockEntity('deals', columns),
      ])

      const result = generateColumnHooks(model)

      expect(result.index).toContain("export * from './useAccountColumns.js'")
      expect(result.index).toContain("export * from './useContactColumns.js'")
      expect(result.index).toContain("export * from './useDealColumns.js'")

      // Check order (alphabetical)
      const accountIndex = result.index.indexOf('useAccountColumns')
      const contactIndex = result.index.indexOf('useContactColumns')
      const dealIndex = result.index.indexOf('useDealColumns')

      expect(accountIndex).toBeLessThan(contactIndex)
      expect(contactIndex).toBeLessThan(dealIndex)
    })

    it('should only export hooks for entities with columnMetadata', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
        createMockEntity('users'), // no columns
      ])

      const result = generateColumnHooks(model)

      expect(result.index).toContain('useAccountColumns.js')
      expect(result.index).not.toContain('useUserColumns.js')
    })
  })

  describe('options - includeJSDoc', () => {
    it('should include JSDoc comments by default', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain('/**')
      expect(contactCode).toContain('* Fetch dynamic column metadata for Contact')
      expect(contactCode).toContain('* Returns static base columns immediately (placeholderData)')
      expect(contactCode).toContain('* @example')
    })

    it('should omit JSDoc comments when disabled', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const generator = new ColumnHookGenerator({ includeJSDoc: false })
      const result = generator.generate(model)
      const contactCode = result.hooks.get('contacts')!

      // File header is always present, but variable/function JSDoc should be omitted
      expect(contactCode).not.toContain('* Query defaults for column metadata')
      expect(contactCode).not.toContain('* Options for useContactColumns hook')
      expect(contactCode).not.toContain('* Fetch dynamic column metadata for Contact')
    })
  })

  describe('file headers', () => {
    it('should include auto-generated warning', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('Auto-generated from OpenAPI specification')
      expect(accountCode).toContain('Do not edit manually - regenerate using sync-patterns CLI')
    })
  })

  describe('usage examples in JSDoc', () => {
    it('should include usage examples', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain('* @example')
      expect(accountCode).toContain('* ```tsx')
      expect(accountCode).toContain('* const { columns, isLoading } = useAccountColumns()')
      expect(accountCode).toContain('* // With options:')
      expect(accountCode).toContain('* const { columns } = useAccountColumns({')
      expect(accountCode).toContain("*   view: 'detail',")
      expect(accountCode).toContain('*   includeExternal: ["salesforce"],')
    })
  })

  describe('multiple entities', () => {
    it('should generate hooks for multiple entities', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
        createMockEntity('contacts', columns),
        createMockEntity('deals', columns),
      ])

      const result = generateColumnHooks(model)

      expect(result.hooks.size).toBe(3)
      expect(result.hooks.has('accounts')).toBe(true)
      expect(result.hooks.has('contacts')).toBe(true)
      expect(result.hooks.has('deals')).toBe(true)

      const accountCode = result.hooks.get('accounts')!
      const contactCode = result.hooks.get('contacts')!
      const dealCode = result.hooks.get('deals')!

      expect(accountCode).toContain('useAccountColumns')
      expect(contactCode).toContain('useContactColumns')
      expect(dealCode).toContain('useDealColumns')
    })
  })

  describe('fetch request configuration', () => {
    it('should use GET method', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('contacts', columns),
      ])

      const result = generateColumnHooks(model)
      const contactCode = result.hooks.get('contacts')!

      expect(contactCode).toContain("method: 'GET',")
    })

    it('should set Content-Type header', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnHooks(model)
      const accountCode = result.hooks.get('accounts')!

      expect(accountCode).toContain("'Content-Type': 'application/json',")
    })

    it('should parse JSON response', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'name',
          label: 'Name',
          type: 'text',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('deals', columns),
      ])

      const result = generateColumnHooks(model)
      const dealCode = result.hooks.get('deals')!

      expect(dealCode).toContain('return response.json()')
    })
  })
})
