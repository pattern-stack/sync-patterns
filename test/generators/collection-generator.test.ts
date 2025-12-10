/**
 * Collection Generator Tests
 *
 * Tests for TanStack DB collection code generation.
 *
 * Architecture:
 * - Realtime collections: ElectricSQL-backed, in-memory with sub-ms reactivity
 * - Offline actions: OfflineExecutor pattern with TanStack Query + IndexedDB persistence
 */

import { describe, it, expect } from 'vitest'
import { generateCollections, CollectionGenerator } from '../../src/generators/collection-generator.js'
import type { ParsedOpenAPI } from '../../src/generators/parser.js'

describe('CollectionGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    info: { title: 'Test API', version: '1.0.0' },
    servers: [],
    endpoints: [],
    schemas: [],
    security: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate realtime collection for syncMode: realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.realtimeCollections.size).toBe(1)
      expect(result.realtimeCollections.has('contacts')).toBe(true)
      expect(result.offlineActions.size).toBe(0)
    })

    it('should generate offline actions for syncMode: offline', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.offlineActions.size).toBe(1)
      expect(result.offlineActions.has('accounts')).toBe(true)
      expect(result.realtimeCollections.size).toBe(0)
      expect(result.offlineExecutor).not.toBeNull()
    })

    it('should not generate collection for syncMode: api', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/users',
            method: 'get',
            operationId: 'list_users',
            syncMode: 'api',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.realtimeCollections.size).toBe(0)
      expect(result.offlineActions.size).toBe(0)
    })

    it('should handle backward compat localFirst: true as realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.realtimeCollections.size).toBe(1)
      expect(result.realtimeCollections.has('contacts')).toBe(true)
      expect(result.offlineActions.size).toBe(0)
    })

    it('should use electricCollectionOptions for realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain("import { createCollection } from '@tanstack/db'")
      expect(contactsCode).toContain("import { electricCollectionOptions } from '@tanstack/electric-db-collection'")
      expect(contactsCode).toContain('electricCollectionOptions({')
    })

    it('should generate offline actions with OfflineExecutor pattern', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const accountsCode = result.offlineActions.get('accounts')!

      // Offline actions import from executor
      expect(accountsCode).toContain("import { offlineExecutor, accountsCollection } from './executor'")
      expect(accountsCode).toContain('createOfflineAccount')
      expect(accountsCode).toContain('updateOfflineAccount')
      expect(accountsCode).toContain('deleteOfflineAccount')
    })

    it('should generate offline executor when offline entities exist', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/memories',
            method: 'get',
            operationId: 'list_memories',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.offlineExecutor).not.toBeNull()
      expect(result.offlineExecutor).toContain('startOfflineExecutor')
      expect(result.offlineExecutor).toContain('IndexedDBAdapter')
      expect(result.offlineExecutor).toContain('memoriesCollection')
    })

    it('should generate correct index with realtime collections', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
          {
            path: '/activities',
            method: 'get',
            operationId: 'list_activities',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      // Check realtime exports
      expect(result.index).toContain("// Realtime collections (ElectricSQL - in-memory, sub-ms)")
      expect(result.index).toContain("export { contactsRealtimeCollection } from './contacts.realtime'")
      expect(result.index).toContain("export { activitiesRealtimeCollection } from './activities.realtime'")
    })

    it('should generate empty result when no synced entities', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/users',
            method: 'get',
            operationId: 'list_users',
            syncMode: 'api',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.realtimeCollections.size).toBe(0)
      expect(result.offlineActions.size).toBe(0)
      expect(result.index).toContain('// No synced entities found in OpenAPI spec')
    })

    it('should generate correct imports in realtime collection file', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain("import { createCollection } from '@tanstack/db'")
      expect(contactsCode).toContain("import { electricCollectionOptions } from '@tanstack/electric-db-collection'")
      expect(contactsCode).toContain("import { getElectricUrl, getApiUrl, getAuthToken } from '../config'")
      expect(contactsCode).toContain("import type { Contact } from '../schemas/contacts'")
    })

    it('should generate realtime collection with correct id', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain("id: 'contacts'")
      expect(contactsCode).toContain("table: 'contacts'")
    })

    it('should generate realtime collection with mutation handlers', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain('onInsert: async ({ transaction }) =>')
      expect(contactsCode).toContain('onUpdate: async ({ transaction }) =>')
      expect(contactsCode).toContain('onDelete: async ({ transaction }) =>')
    })

    it('should use config functions for URLs and auth in realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain('${getApiUrl()}/contacts')
      expect(contactsCode).toContain('${getAuthToken()}')
      expect(contactsCode).toContain('${getElectricUrl()}/v1/shape')
    })

    it('should generate proper error messages with entity name', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain("throw new Error('Failed to create contacts')")
      expect(contactsCode).toContain("throw new Error('Failed to update contacts')")
      expect(contactsCode).toContain("throw new Error('Failed to delete contacts')")
    })

    it('should generate offline executor with sync functions', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      // Sync function is defined in executor
      expect(result.offlineExecutor).toContain('async function syncAccount')
      // And registered in mutationFns
      expect(result.offlineExecutor).toContain('mutationFns: {')
      expect(result.offlineExecutor).toContain('syncAccount,')
    })

    it('should generate offline actions with create/update/delete functions', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const accountsCode = result.offlineActions.get('accounts')!

      expect(accountsCode).toContain('export function createOfflineAccount')
      expect(accountsCode).toContain('export function updateOfflineAccount')
      expect(accountsCode).toContain('export function deleteOfflineAccount')
    })

    it('should export realtime collection with correct name', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.realtimeCollections.get('contacts')!

      expect(contactsCode).toContain('export const contactsRealtimeCollection = createCollection<Contact>(')
    })
  })

  describe('extractEntityName', () => {
    const generator = new CollectionGenerator()

    it('should extract entity from simple path', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.realtimeCollections.has('contacts')).toBe(true)
    })

    it('should skip api version prefix', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/api/v1/contacts',
            method: 'get',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.realtimeCollections.has('contacts')).toBe(true)
    })

    it('should ignore path parameters', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts/{id}',
            method: 'get',
            syncMode: 'realtime',
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.realtimeCollections.has('contacts')).toBe(true)
    })
  })

  describe('syncMode detection', () => {
    it('should prioritize explicit syncMode over localFirst', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/items',
            method: 'get',
            syncMode: 'offline', // explicit
            localFirst: true,    // should be ignored
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.offlineActions.has('items')).toBe(true)
      expect(result.realtimeCollections.has('items')).toBe(false)
    })

    it('should default to api when no sync config', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/items',
            method: 'get',
            // no syncMode or localFirst
            parameters: [],
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.offlineActions.size).toBe(0)
      expect(result.realtimeCollections.size).toBe(0)
    })
  })
})
