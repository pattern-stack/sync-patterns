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
    title: 'Test API',
    version: '1.0.0',
    endpoints: [],
    schemas: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate collections only for local_first entities', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            localFirst: false,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.collections.size).toBe(1)
      expect(result.collections.has('contacts')).toBe(true)
      expect(result.collections.has('accounts')).toBe(false)
    })

    it('should generate empty result when no local_first entities', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/accounts',
            method: 'get',
            operationId: 'list_accounts',
            localFirst: false,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.collections.size).toBe(0)
    })

    it('should generate correct imports in collection file', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.collections.get('contacts')!

      expect(contactsCode).toContain("import { createCollection } from '@tanstack/db'")
      expect(contactsCode).toContain("import { electricCollectionOptions } from '@tanstack/electric-db-collection'")
      expect(contactsCode).toContain("import { getElectricUrl, getApiUrl, getAuthToken } from '../config'")
    })

    it('should generate collection with correct id', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.collections.get('contacts')!

      expect(contactsCode).toContain("id: 'contacts'")
      expect(contactsCode).toContain("table: 'contacts'")
    })

    it('should generate collection with mutation handlers', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.collections.get('contacts')!

      expect(contactsCode).toContain('onInsert: async ({ transaction }) =>')
      expect(contactsCode).toContain('onUpdate: async ({ transaction }) =>')
      expect(contactsCode).toContain('onDelete: async ({ transaction }) =>')
    })

    it('should use config functions for URLs and auth', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.collections.get('contacts')!

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
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      const contactsCode = result.collections.get('contacts')!

      expect(contactsCode).toContain("throw new Error('Failed to create contacts')")
      expect(contactsCode).toContain("throw new Error('Failed to update contacts')")
      expect(contactsCode).toContain("throw new Error('Failed to delete contacts')")
    })

    it('should generate index file with exports', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          },
          {
            path: '/tasks',
            method: 'get',
            operationId: 'list_tasks',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)

      expect(result.index).toContain("export { contactsCollection } from './contacts'")
      expect(result.index).toContain("export { tasksCollection } from './tasks'")
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
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.collections.has('contacts')).toBe(true)
    })

    it('should skip api version prefix', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/api/v1/contacts',
            method: 'get',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.collections.has('contacts')).toBe(true)
    })

    it('should ignore path parameters', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          {
            path: '/contacts/{id}',
            method: 'get',
            localFirst: true,
            responses: [],
          },
        ],
      })

      const result = generateCollections(parsedAPI)
      expect(result.collections.has('contacts')).toBe(true)
    })
  })
})
