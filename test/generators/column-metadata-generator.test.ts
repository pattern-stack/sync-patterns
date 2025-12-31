/**
 * Column Metadata Generator Tests
 *
 * Tests for static column metadata generation from EntityModel.
 */

import { describe, it, expect } from 'vitest'
import { ColumnMetadataGenerator, generateColumnMetadata } from '../../src/generators/column-metadata-generator.js'
import type { EntityModel, EntityDefinition, ColumnMetadata } from '../../src/core/entity-model.js'
import { createEmptyEntityModel } from '../../src/core/entity-model.js'

describe('ColumnMetadataGenerator', () => {
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

      const result = generateColumnMetadata(model)

      expect(result.columns.size).toBe(0)
      expect(result.types).toBeTruthy()
      expect(result.index).toBeTruthy()
    })

    it('should generate column file for entity with columnMetadata', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'id',
          label: 'ID',
          type: 'text',
          importance: 'critical',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
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

      const result = generateColumnMetadata(model)

      expect(result.columns.size).toBe(1)
      expect(result.columns.has('accounts')).toBe(true)
    })

    it('should generate correct column metadata constant', () => {
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

      const result = generateColumnMetadata(model)
      const contactCode = result.columns.get('contacts')!

      expect(contactCode).toContain('export const contactBaseColumns: ColumnMetadata[]')
      expect(contactCode).toContain("field: 'name'")
      expect(contactCode).toContain("label: 'Name'")
      expect(contactCode).toContain("type: 'text'")
      expect(contactCode).toContain("importance: 'high'")
    })

    it('should escape strings properly in generated code', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'description',
          label: "User's Description",
          type: 'text',
          importance: 'medium',
          sortable: false,
          filterable: true,
          visible: true,
          required: false,
          computed: false,
          source: 'user',
          description: "This is a user's custom field",
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('tasks', columns),
      ])

      const result = generateColumnMetadata(model)
      const taskCode = result.columns.get('tasks')!

      expect(taskCode).toContain("label: 'User\\'s Description'")
      expect(taskCode).toContain("description: 'This is a user\\'s custom field'")
    })

    it('should include optional fields when present', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'amount',
          label: 'Amount',
          type: 'money',
          importance: 'high',
          group: 'Financial',
          sortable: true,
          filterable: true,
          format: { currency: 'USD', decimals: 2 },
          description: 'Transaction amount',
          placeholder: 'Enter amount',
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('transactions', columns),
      ])

      const result = generateColumnMetadata(model)
      const transactionCode = result.columns.get('transactions')!

      expect(transactionCode).toContain("group: 'Financial'")
      expect(transactionCode).toContain('format: {"currency":"USD","decimals":2}')
      expect(transactionCode).toContain("description: 'Transaction amount'")
      expect(transactionCode).toContain("placeholder: 'Enter amount'")
    })

    it('should include options array for badge/status fields', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'status',
          label: 'Status',
          type: 'status',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
          options: ['draft', 'active', 'completed'],
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('deals', columns),
      ])

      const result = generateColumnMetadata(model)
      const dealCode = result.columns.get('deals')!

      expect(dealCode).toContain('options: ["draft","active","completed"]')
    })

    it('should generate type-safe field union', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'id',
          label: 'ID',
          type: 'text',
          importance: 'critical',
          sortable: true,
          filterable: false,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
        },
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

      const result = generateColumnMetadata(model)
      const accountCode = result.columns.get('accounts')!

      expect(accountCode).toContain("export type AccountField = 'id' | 'name'")
    })

    it('should generate helper function to get column by field', () => {
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

      const result = generateColumnMetadata(model)
      const contactCode = result.columns.get('contacts')!

      expect(contactCode).toContain('export function getContactColumn(field: ContactField)')
      expect(contactCode).toContain('return contactBaseColumns.find((c) => c.field === field)')
    })

    it('should skip entities without columnMetadata', () => {
      const model = createMockEntityModel([
        createMockEntity('accounts'),
        createMockEntity('contacts', [
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
        ]),
      ])

      const result = generateColumnMetadata(model)

      expect(result.columns.size).toBe(1)
      expect(result.columns.has('contacts')).toBe(true)
      expect(result.columns.has('accounts')).toBe(false)
    })
  })

  describe('entity reference generation', () => {
    it('should include reference field for entity type columns', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'category_id',
          label: 'Category',
          type: 'entity',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
          reference: {
            entity: 'categories',
            displayField: 'name',
          },
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('transactions', columns),
      ])

      const result = generateColumnMetadata(model)
      const transactionCode = result.columns.get('transactions')!

      expect(transactionCode).toContain('reference: {')
      expect(transactionCode).toContain("entity: 'categories'")
      expect(transactionCode).toContain("displayField: 'name'")
    })

    it('should include endpoint in reference when present', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'account_id',
          label: 'Account',
          type: 'entity',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
          reference: {
            entity: 'accounts',
            displayField: 'title',
            endpoint: '/api/v1/accounts',
          },
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('transactions', columns),
      ])

      const result = generateColumnMetadata(model)
      const transactionCode = result.columns.get('transactions')!

      expect(transactionCode).toContain('reference: {')
      expect(transactionCode).toContain("entity: 'accounts'")
      expect(transactionCode).toContain("displayField: 'title'")
      expect(transactionCode).toContain("endpoint: '/api/v1/accounts'")
    })

    it('should not include reference field for non-entity type columns', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'amount',
          label: 'Amount',
          type: 'money',
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
        createMockEntity('transactions', columns),
      ])

      const result = generateColumnMetadata(model)
      const transactionCode = result.columns.get('transactions')!

      expect(transactionCode).not.toContain('reference: {')
    })

    it('should escape special characters in reference entity and displayField', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'user_id',
          label: 'User',
          type: 'entity',
          importance: 'high',
          sortable: true,
          filterable: true,
          visible: true,
          required: true,
          computed: false,
          source: 'system',
          reference: {
            entity: "user's",
            displayField: "name's",
          },
        },
      ]

      const model = createMockEntityModel([
        createMockEntity('tasks', columns),
      ])

      const result = generateColumnMetadata(model)
      const taskCode = result.columns.get('tasks')!

      expect(taskCode).toContain("entity: 'user\\'s'")
      expect(taskCode).toContain("displayField: 'name\\'s'")
    })
  })

  describe('types file generation', () => {
    it('should generate UIType with all 19 types', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      const types = result.types

      // Text types
      expect(types).toContain("| 'text'")
      expect(types).toContain("| 'password'")
      // Number types
      expect(types).toContain("| 'number'")
      expect(types).toContain("| 'money'")
      expect(types).toContain("| 'percent'")
      // Date types
      expect(types).toContain("| 'date'")
      expect(types).toContain("| 'datetime'")
      // Link types
      expect(types).toContain("| 'email'")
      expect(types).toContain("| 'url'")
      expect(types).toContain("| 'phone'")
      // Boolean
      expect(types).toContain("| 'boolean'")
      // Visual chips
      expect(types).toContain("| 'badge'")
      expect(types).toContain("| 'status'")
      // Entity references
      expect(types).toContain("| 'entity'")
      expect(types).toContain("| 'user'")
      // Special
      expect(types).toContain("| 'json'")
      expect(types).toContain("| 'image'")
      expect(types).toContain("| 'rating'")
      expect(types).toContain("| 'color'")
      expect(types).toContain("| 'file'")
    })

    it('should generate UIImportance type', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      expect(result.types).toContain("export type UIImportance = 'critical' | 'high' | 'medium' | 'low' | 'minimal'")
    })

    it('should generate ColumnMetadata interface', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      expect(result.types).toContain('export interface ColumnMetadata {')
      expect(result.types).toContain('field: string')
      expect(result.types).toContain('label: string')
      expect(result.types).toContain('type: UIType')
      expect(result.types).toContain('importance: UIImportance')
      expect(result.types).toContain('reference?: EntityReference')
    })

    it('should generate EntityReference interface', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      expect(result.types).toContain('export interface EntityReference {')
      expect(result.types).toContain('entity: string')
      expect(result.types).toContain('displayField: string')
      expect(result.types).toContain('endpoint?: string')
    })

    it('should generate ColumnMetadataResponse interface', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      expect(result.types).toContain('export interface ColumnMetadataResponse {')
      expect(result.types).toContain('columns: ColumnMetadata[]')
      expect(result.types).toContain('entity: string')
      expect(result.types).toContain('view: string')
    })
  })

  describe('index file generation', () => {
    it('should export types', () => {
      const model = createEmptyEntityModel()
      const result = generateColumnMetadata(model)

      expect(result.index).toContain("export * from './types.js'")
    })

    it('should export entity columns in sorted order', () => {
      const columns: ColumnMetadata[] = [
        {
          field: 'id',
          label: 'ID',
          type: 'text',
          importance: 'critical',
          sortable: true,
          filterable: false,
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

      const result = generateColumnMetadata(model)

      expect(result.index).toContain("export * from './account.columns.js'")
      expect(result.index).toContain("export * from './contact.columns.js'")
      expect(result.index).toContain("export * from './deal.columns.js'")

      // Check order (alphabetical)
      const accountIndex = result.index.indexOf('account.columns')
      const contactIndex = result.index.indexOf('contact.columns')
      const dealIndex = result.index.indexOf('deal.columns')

      expect(accountIndex).toBeLessThan(contactIndex)
      expect(contactIndex).toBeLessThan(dealIndex)
    })

    it('should only export entities with column metadata', () => {
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

      const result = generateColumnMetadata(model)

      expect(result.index).toContain('account.columns.js')
      expect(result.index).not.toContain('user.columns.js')
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
        createMockEntity('accounts', columns),
      ])

      const result = generateColumnMetadata(model)
      const accountCode = result.columns.get('accounts')!

      expect(accountCode).toContain('/**')
      expect(accountCode).toContain('* Static column metadata for Account entity')
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
        createMockEntity('accounts', columns),
      ])

      const generator = new ColumnMetadataGenerator({ includeJSDoc: false })
      const result = generator.generate(model)
      const accountCode = result.columns.get('accounts')!

      // File header is always present, but variable/function JSDoc should be omitted
      expect(accountCode).not.toContain('* Static column metadata for Account entity')
      expect(accountCode).not.toContain('* Type-safe field names for Account')
      expect(accountCode).not.toContain('* Get column metadata by field name')
    })
  })

  describe('file header generation', () => {
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

      const result = generateColumnMetadata(model)
      const accountCode = result.columns.get('accounts')!

      expect(accountCode).toContain('Auto-generated from OpenAPI specification')
      expect(accountCode).toContain('Do not edit manually - regenerate using sync-patterns CLI')
    })
  })
})
