/**
 * Collection Generator Tests
 *
 * Tests for TanStack DB collection code generation.
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
      expect(result.offlineCollections.size).toBe(0)
    })

    it('should generate offline collection for syncMode: offline', () => {
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

      expect(result.offlineCollections.size).toBe(1)
      expect(result.offlineCollections.has('accounts')).toBe(true)
      expect(result.realtimeCollections.size).toBe(0)
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
      expect(result.offlineCollections.size).toBe(0)
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
      expect(result.offlineCollections.size).toBe(0)
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

    it('should use rxdbCollectionOptions for offline', () => {
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
      const accountsCode = result.offlineCollections.get('accounts')!

      expect(accountsCode).toContain("import { createCollection } from '@tanstack/db'")
      expect(accountsCode).toContain("import { rxdbCollectionOptions } from '@tanstack/rxdb-db-collection'")
      expect(accountsCode).toContain('rxdbCollectionOptions({')
    })

    it('should import from rxdb-init for offline collections', () => {
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
      const memoriesCode = result.offlineCollections.get('memories')!

      expect(memoriesCode).toContain("import { getRxDatabase } from '../db/rxdb-init'")
      expect(memoriesCode).toContain("import type { MemoryDocument } from '../db/schemas/memories.schema'")
    })

    it('should generate correct index with both collection types', () => {
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
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            syncMode: 'offline',
            parameters: [],
            responses: [],
          },
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

      // Check realtime exports
      expect(result.index).toContain("// Realtime collections (ElectricSQL - in-memory, sub-ms)")
      expect(result.index).toContain("export { contactsRealtimeCollection } from './contacts.realtime'")
      expect(result.index).toContain("export { activitiesRealtimeCollection } from './activities.realtime'")

      // Check offline exports
      expect(result.index).toContain("// Offline collections (RxDB - IndexedDB, persistent)")
      expect(result.index).toContain("export { accountsOfflineCollection } from './accounts.offline'")
      expect(result.index).toContain("export { memoriesOfflineCollection } from './memories.offline'")
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
      expect(result.offlineCollections.size).toBe(0)
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
      expect(contactsCode).toContain("import type { Contact } from '../schemas/contacts.schema'")
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

    it('should generate offline collection with getRxDatabase call', () => {
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
      const accountsCode = result.offlineCollections.get('accounts')!

      expect(accountsCode).toContain('getRxCollection: async () => {')
      expect(accountsCode).toContain('const db = await getRxDatabase()')
      expect(accountsCode).toContain('return db.accounts')
    })

    it('should export offline collection with correct name', () => {
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
      const accountsCode = result.offlineCollections.get('accounts')!

      expect(accountsCode).toContain('export const accountsOfflineCollection = createCollection<AccountDocument>(')
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

      expect(result.offlineCollections.has('items')).toBe(true)
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

      expect(result.offlineCollections.size).toBe(0)
      expect(result.realtimeCollections.size).toBe(0)
    })
  })
})
