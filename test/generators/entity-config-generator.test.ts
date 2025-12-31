/**
 * Entity Config Generator Tests
 *
 * Tests for semantic field mapping generation (titleField, statusField, valueField).
 */

import { describe, it, expect } from 'vitest'
import { EntityConfigGenerator, generateEntityConfigs } from '../../src/generators/entity-config-generator.js'
import type { EntityModel, EntityDefinition, EntityUIConfig, ColumnMetadata } from '../../src/core/entity-model.js'
import { createEmptyEntityModel } from '../../src/core/entity-model.js'

describe('EntityConfigGenerator', () => {
  const createMockEntity = (
    name: string,
    uiConfig?: EntityUIConfig,
    columnMetadata?: ColumnMetadata[]
  ): EntityDefinition => ({
    name,
    singular: name.slice(0, -1), // simple singularization
    pascalName: name.charAt(0).toUpperCase() + name.slice(1, -1),
    syncMode: 'api',
    operations: {},
    customOperations: [],
    schemas: {},
    uiConfig,
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
    it('should generate empty result when no entities have uiConfig', () => {
      const model = createMockEntityModel([
        createMockEntity('accounts'),
      ])

      const result = generateEntityConfigs(model)

      expect(result.configs.size).toBe(0)
      expect(result.types).toBeTruthy()
      expect(result.index).toBeTruthy()
    })

    it('should generate config file for entity with uiConfig', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.configs.size).toBe(1)
      expect(result.configs.has('accounts')).toBe(true)
    })

    it('should skip entities without uiConfig', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
        createMockEntity('users'), // no uiConfig
      ])

      const result = generateEntityConfigs(model)

      expect(result.configs.size).toBe(1)
      expect(result.configs.has('accounts')).toBe(true)
      expect(result.configs.has('users')).toBe(false)
    })
  })

  describe('entity config file generation', () => {
    it('should generate config with titleField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).toContain("export const contactConfig: EntityConfig = {")
      expect(contactCode).toContain("entityType: 'contact'")
      expect(contactCode).toContain("titleField: 'name'")
    })

    it('should generate config with subtitleField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        subtitleField: 'company',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).toContain("subtitleField: 'company'")
    })

    it('should generate config with valueField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'title',
        valueField: 'amount',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('deals', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const dealCode = result.configs.get('deals')!

      expect(dealCode).toContain("valueField: 'amount'")
    })

    it('should generate config with statusField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'title',
        statusField: 'stage',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('deals', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const dealCode = result.configs.get('deals')!

      expect(dealCode).toContain("statusField: 'stage'")
    })

    it('should generate config with metadataFields array', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: ['created_at', 'updated_at', 'owner'],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const accountCode = result.configs.get('accounts')!

      expect(accountCode).toContain('metadataFields: ["created_at","updated_at","owner"]')
    })

    it('should generate empty metadataFields when not specified', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).toContain('metadataFields: []')
    })

    it('should include icon when present', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        icon: 'Building2',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const accountCode = result.configs.get('accounts')!

      expect(accountCode).toContain("icon: 'Building2'")
      expect(accountCode).toContain('// Icon can be imported from lucide-react:')
      expect(accountCode).toContain('// import { Building2 } from \'lucide-react\'')
    })
  })

  describe('helper functions generation', () => {
    it('should generate getTitle helper function', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).toContain('export function getContactTitle(data: Record<string, unknown>): string {')
      expect(contactCode).toContain("return String(data['name'] ?? '')")
    })

    it('should generate getTitle with fallback when no titleField', () => {
      const uiConfig: EntityUIConfig = {
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('items', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const itemCode = result.configs.get('items')!

      expect(itemCode).toContain('export function getItemTitle(data: Record<string, unknown>): string {')
      expect(itemCode).toContain("return String(data.id ?? data.name ?? '')")
    })

    it('should generate getStatus helper when statusField exists', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'title',
        statusField: 'stage',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('deals', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const dealCode = result.configs.get('deals')!

      expect(dealCode).toContain('export function getDealStatus(data: Record<string, unknown>): string | undefined {')
      expect(dealCode).toContain("const status = data['stage']")
      expect(dealCode).toContain('return status != null ? String(status) : undefined')
    })

    it('should not generate getStatus when no statusField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).not.toContain('export function getContactStatus')
    })

    it('should generate getValue helper when valueField exists', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'title',
        valueField: 'amount',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('deals', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const dealCode = result.configs.get('deals')!

      expect(dealCode).toContain('export function getDealValue(data: Record<string, unknown>): number | undefined {')
      expect(dealCode).toContain("const value = data['amount']")
      expect(dealCode).toContain('if (value == null) return undefined')
      expect(dealCode).toContain("return typeof value === 'number' ? value : parseFloat(String(value))")
    })

    it('should not generate getValue when no valueField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).not.toContain('export function getContactValue')
    })
  })

  describe('types file generation', () => {
    it('should generate EntityConfig interface', () => {
      const model = createEmptyEntityModel()
      const result = generateEntityConfigs(model)

      expect(result.types).toContain('export interface EntityConfig {')
      expect(result.types).toContain('entityType: string')
      expect(result.types).toContain('titleField?: string')
      expect(result.types).toContain('subtitleField?: string')
      expect(result.types).toContain('valueField?: string')
      expect(result.types).toContain('statusField?: string')
      expect(result.types).toContain('metadataFields: string[]')
      expect(result.types).toContain('icon?: string')
    })

    it('should generate EntityConfigMap type', () => {
      const model = createEmptyEntityModel()
      const result = generateEntityConfigs(model)

      expect(result.types).toContain('export type EntityConfigMap = Record<string, EntityConfig>')
    })

    it('should include helpful comments', () => {
      const model = createEmptyEntityModel()
      const result = generateEntityConfigs(model)

      expect(result.types).toContain('Semantic field mapping for entity display')
      expect(result.types).toContain('Used by EntityCard, EntityTable, EntityDetail components')
    })
  })

  describe('index file generation', () => {
    it('should export types', () => {
      const model = createEmptyEntityModel()
      const result = generateEntityConfigs(model)

      expect(result.index).toContain("export * from './types.js'")
    })

    it('should export entity configs in sorted order', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
        createMockEntity('accounts', uiConfig),
        createMockEntity('deals', uiConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.index).toContain("export * from './account.config.js'")
      expect(result.index).toContain("export * from './contact.config.js'")
      expect(result.index).toContain("export * from './deal.config.js'")

      // Check order (alphabetical)
      const accountIndex = result.index.indexOf('account.config')
      const contactIndex = result.index.indexOf('contact.config')
      const dealIndex = result.index.indexOf('deal.config')

      expect(accountIndex).toBeLessThan(contactIndex)
      expect(contactIndex).toBeLessThan(dealIndex)
    })

    it('should import configs for aggregated map', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.index).toContain("import { accountConfig } from './account.config.js'")
      expect(result.index).toContain("import { contactConfig } from './contact.config.js'")
    })

    it('should generate aggregated entityConfigs map', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.index).toContain('export const entityConfigs: Record<string, import("./types.js").EntityConfig> = {')
      expect(result.index).toContain('account: accountConfig,')
      expect(result.index).toContain('contact: contactConfig,')
    })

    it('should generate getEntityConfig helper', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.index).toContain('export function getEntityConfig(entityType: string): import("./types.js").EntityConfig | undefined {')
      expect(result.index).toContain('return entityConfigs[entityType]')
    })

    it('should only export entities with uiConfig', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
        createMockEntity('users'), // no uiConfig
      ])

      const result = generateEntityConfigs(model)

      expect(result.index).toContain('account.config.js')
      expect(result.index).not.toContain('user.config.js')
    })
  })

  describe('options - includeJSDoc', () => {
    it('should include JSDoc comments by default', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const accountCode = result.configs.get('accounts')!

      expect(accountCode).toContain('/**')
      expect(accountCode).toContain('* UI configuration for Account entity')
      expect(accountCode).toContain('* Derived from column metadata at generation time.')
    })

    it('should omit JSDoc comments when disabled', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const generator = new EntityConfigGenerator({ includeJSDoc: false })
      const result = generator.generate(model)
      const accountCode = result.configs.get('accounts')!

      // File header is always present, but variable/function JSDoc should be omitted
      expect(accountCode).not.toContain('* UI configuration for Account entity')
      expect(accountCode).not.toContain('* Get the display title for a Account')
    })
  })

  describe('file headers', () => {
    it('should include auto-generated warning', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const accountCode = result.configs.get('accounts')!

      expect(accountCode).toContain('Auto-generated from OpenAPI specification')
      expect(accountCode).toContain('Do not edit manually - regenerate using sync-patterns CLI')
    })
  })

  describe('comprehensive config scenarios', () => {
    it('should generate complete config with all fields', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        subtitleField: 'company',
        valueField: 'annual_revenue',
        statusField: 'status',
        metadataFields: ['created_at', 'owner', 'industry'],
        icon: 'Building2',
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const accountCode = result.configs.get('accounts')!

      expect(accountCode).toContain("titleField: 'name'")
      expect(accountCode).toContain("subtitleField: 'company'")
      expect(accountCode).toContain("valueField: 'annual_revenue'")
      expect(accountCode).toContain("statusField: 'status'")
      expect(accountCode).toContain('metadataFields: ["created_at","owner","industry"]')
      expect(accountCode).toContain("icon: 'Building2'")
    })

    it('should generate minimal config with only titleField', () => {
      const uiConfig: EntityUIConfig = {
        titleField: 'name',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('contacts', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const contactCode = result.configs.get('contacts')!

      expect(contactCode).toContain("titleField: 'name'")
      expect(contactCode).not.toContain('subtitleField:')
      expect(contactCode).not.toContain('valueField:')
      expect(contactCode).not.toContain('statusField:')
      expect(contactCode).toContain('metadataFields: []')
    })

    it('should handle entity with no titleField', () => {
      const uiConfig: EntityUIConfig = {
        statusField: 'status',
        metadataFields: ['created_at'],
      }

      const model = createMockEntityModel([
        createMockEntity('tasks', uiConfig),
      ])

      const result = generateEntityConfigs(model)
      const taskCode = result.configs.get('tasks')!

      expect(taskCode).not.toContain('titleField:')
      expect(taskCode).toContain("statusField: 'status'")
      // getTitle should use fallback
      expect(taskCode).toContain("return String(data.id ?? data.name ?? '')")
    })
  })

  describe('multiple entities', () => {
    it('should generate configs for multiple entities', () => {
      const accountConfig: EntityUIConfig = {
        titleField: 'name',
        valueField: 'revenue',
        metadataFields: [],
      }

      const contactConfig: EntityUIConfig = {
        titleField: 'name',
        subtitleField: 'company',
        metadataFields: [],
      }

      const model = createMockEntityModel([
        createMockEntity('accounts', accountConfig),
        createMockEntity('contacts', contactConfig),
      ])

      const result = generateEntityConfigs(model)

      expect(result.configs.size).toBe(2)
      expect(result.configs.has('accounts')).toBe(true)
      expect(result.configs.has('contacts')).toBe(true)

      const accountCode = result.configs.get('accounts')!
      const contactCode = result.configs.get('contacts')!

      expect(accountCode).toContain('accountConfig')
      expect(accountCode).toContain("valueField: 'revenue'")

      expect(contactCode).toContain('contactConfig')
      expect(contactCode).toContain("subtitleField: 'company'")
    })
  })
})
