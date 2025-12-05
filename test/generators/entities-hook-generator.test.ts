/**
 * Entities Hook Generator Tests
 */

import { describe, it, expect } from 'vitest'
import { generateEntitiesHook } from '../../src/generators/entities-hook-generator.js'
import type { ParsedOpenAPI, ParsedEndpoint } from '../../src/generators/parser.js'

describe('EntitiesHookGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    info: { title: 'Test API', version: '1.0.0' },
    servers: [],
    endpoints: [],
    schemas: [],
    security: [],
    ...overrides,
  })

  const createEndpoint = (overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint => ({
    path: '/contacts',
    method: 'get',
    operationId: 'list_contacts',
    parameters: [],
    responses: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate imports from entity files and frontend-patterns', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      // Frontend-patterns imports for metadata
      expect(result.code).toContain("import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'")
      expect(result.code).toContain("import { useEntityData } from '@pattern-stack/frontend-patterns'")

      // Unified types import
      expect(result.code).toContain("import type { UnifiedQueryResult, UnifiedMutationResult } from './entities/types'")

      // Entity imports
      expect(result.code).toContain("from './entities/accounts'")
    })

    it('should import query hooks for list and get operations', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', operationId: 'get_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useContacts')
      expect(result.code).toContain('useContact')
    })

    it('should import mutation hooks for create, update, delete', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'post', operationId: 'create_contact' }),
          createEndpoint({ path: '/contacts/{id}', method: 'patch', operationId: 'update_contact' }),
          createEndpoint({ path: '/contacts/{id}', method: 'delete', operationId: 'delete_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useCreateContact')
      expect(result.code).toContain('useUpdateContact')
      expect(result.code).toContain('useDeleteContact')
    })

    it('should generate EntityApi interface with 4 type params and useMetadata', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      // EntityApi interface with 4 type params (matching spec)
      expect(result.code).toContain('export interface EntityApi<')
      expect(result.code).toContain('TList = unknown,')
      expect(result.code).toContain('TOne = unknown,')
      expect(result.code).toContain('TCreate = unknown,')
      expect(result.code).toContain('TUpdate = unknown')
      expect(result.code).toContain('useList: () => UnifiedQueryResult<TList[]>')
      expect(result.code).toContain('useOne: (id: string) => UnifiedQueryResult<TOne | undefined>')
      expect(result.code).toContain("useMetadata: (view?: 'list' | 'detail' | 'form') => MetadataResult")
      expect(result.code).toContain('create?: UnifiedMutationResult<TOne, TCreate>')
      expect(result.code).toContain('update?: UnifiedMutationResult<TOne, { id: string; data: TUpdate }>')
      expect(result.code).toContain('delete?: UnifiedMutationResult<void, string>')

      // MetadataResult interface
      expect(result.code).toContain('export interface MetadataResult {')
      expect(result.code).toContain('columns: ColumnMetadata[]')
      expect(result.code).toContain('isLoading: boolean')
    })

    it('should generate Entities interface with typed aliases', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      // Typed aliases
      expect(result.code).toContain('export type AccountsApi = EntityApi<Account')
      expect(result.code).toContain('export type ContactsApi = EntityApi<Contact')

      // Entities interface uses typed aliases
      expect(result.code).toContain('export interface Entities {')
      expect(result.code).toContain('accounts: AccountsApi')
      expect(result.code).toContain('contacts: ContactsApi')
      expect(result.code).toContain('get: (name: string) => EntityApi | undefined')
    })

    it('should generate useEntities hook with mutation calls at top level', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts', method: 'post', operationId: 'create_contact' }),
          createEndpoint({ path: '/contacts/{id}', method: 'delete', operationId: 'delete_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('export function useEntities(): Entities {')
      expect(result.code).toContain('// Call ALL mutation hooks unconditionally')
      expect(result.code).toContain('const contactsCreate = useCreateContact()')
      expect(result.code).toContain('const contactsDelete = useDeleteContact()')
    })

    it('should build entity API objects with typed aliases and metadata', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', operationId: 'get_contact' }),
          createEndpoint({ path: '/contacts', method: 'post', operationId: 'create_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      // createMetadataHook factory
      expect(result.code).toContain('function createMetadataHook(entityName: string)')
      expect(result.code).toContain('useEntityData(entityName, { view })')

      // Entity API with useMetadata
      expect(result.code).toContain('const contactsApi: ContactsApi = {')
      expect(result.code).toContain('useList: useContacts,')
      expect(result.code).toContain('useOne: useContact,')
      expect(result.code).toContain("useMetadata: createMetadataHook('contacts'),")
      expect(result.code).toContain('create: contactsCreate,')
    })

    it('should generate registry for dynamic lookup', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('const registry: Record<string, EntityApi> = {')
      expect(result.code).toContain('accounts: accountsApi,')
      expect(result.code).toContain('contacts: contactsApi,')
      expect(result.code).toContain('get: (name: string) => registry[name],')
    })

    it('should generate utility functions', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain("const ENTITY_NAMES = ['accounts', 'contacts'] as const")
      expect(result.code).toContain('export function hasEntity(name: string): boolean')
      expect(result.code).toContain('export function getEntityNames(): readonly string[]')
    })

    it('should not include entities without CRUD operations', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/health', method: 'get', operationId: 'health_check' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).not.toContain('HealthApi')
      expect(result.code).toContain('contacts: ContactsApi')
    })

    it('should handle multiple entities correctly', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
          createEndpoint({ path: '/accounts', method: 'post', operationId: 'create_account' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'delete', operationId: 'delete_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      // Accounts
      expect(result.code).toContain('useAccounts')
      expect(result.code).toContain('useAccount')
      expect(result.code).toContain('useCreateAccount')

      // Contacts
      expect(result.code).toContain('useContacts')
      expect(result.code).toContain('useDeleteContact')

      // Both in registry
      expect(result.code).toContain('accounts: accountsApi,')
      expect(result.code).toContain('contacts: contactsApi,')
    })

    it('should handle PUT as update operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts/{id}', method: 'put', operationId: 'update_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useUpdateContact')
    })

    it('should handle search as list operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts/search', method: 'get', operationId: 'search_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useList: useContacts,')
    })

    it('should include JSDoc comments when enabled', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI, { includeJSDoc: true })

      expect(result.code).toContain('/**')
      expect(result.code).toContain('* Generic entity API shape with full type safety.')
      expect(result.code).toContain('* Access all entity APIs with full TypeScript support.')
    })

    it('should omit JSDoc comments when disabled', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI, { includeJSDoc: false })

      expect(result.code).not.toContain('* Generic entity API shape')
      expect(result.code).not.toContain('* Access all entity APIs with full TypeScript support.')
    })
  })

  describe('entity name extraction', () => {
    it('should extract entity name from simple path', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/users', method: 'get', operationId: 'list_users' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('users: UsersApi')
      expect(result.code).toContain('export type UsersApi = EntityApi<User')
    })

    it('should skip api version prefixes', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/api/v1/users', method: 'get', operationId: 'list_users' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('users: UsersApi')
      expect(result.code).not.toContain('ApiApi')
      expect(result.code).not.toContain('V1Api')
    })

    it('should handle kebab-case paths', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/user-profiles', method: 'get', operationId: 'list_user_profiles' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain("from './entities/user-profiles'")
    })
  })

  describe('singularization', () => {
    it('should singularize regular plurals', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', operationId: 'get_contact' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useContact')  // singular
      expect(result.code).toContain('useContacts') // plural
    })

    it('should handle -ies plurals', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/activities', method: 'get', operationId: 'list_activities' }),
          createEndpoint({ path: '/activities/{id}', method: 'get', operationId: 'get_activity' }),
        ],
      })

      const result = generateEntitiesHook(parsedAPI)

      expect(result.code).toContain('useActivity')   // singular
      expect(result.code).toContain('useActivities') // plural
    })
  })
})
