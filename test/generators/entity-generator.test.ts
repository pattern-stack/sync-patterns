/**
 * Entity Generator Tests
 *
 * Tests for unified entity wrapper code generation.
 */

import { describe, it, expect } from 'vitest'
import { generateEntityWrappers } from '../../src/generators/entity-generator.js'
import type { ParsedOpenAPI, ParsedEndpoint } from '../../src/generators/parser.js'

describe('EntityGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    title: 'Test API',
    version: '1.0.0',
    endpoints: [],
    schemas: [],
    ...overrides,
  })

  const createEndpoint = (overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint => ({
    path: '/contacts',
    method: 'get',
    operationId: 'list_contacts',
    responses: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate entity wrapper for CRUD operations', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', operationId: 'get_contact' }),
          createEndpoint({ path: '/contacts', method: 'post', operationId: 'create_contact' }),
          createEndpoint({ path: '/contacts/{id}', method: 'patch', operationId: 'update_contact' }),
          createEndpoint({ path: '/contacts/{id}', method: 'delete', operationId: 'delete_contact' }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)

      expect(result.wrappers.size).toBe(1)
      expect(result.wrappers.has('contacts')).toBe(true)
    })

    it('should generate list hook (useContacts)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [{
              statusCode: '200',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useContacts()')
      expect(contactsCode).toContain("if (isLocalFirst('contacts'))")
      expect(contactsCode).toContain('useLiveQuery')
      expect(contactsCode).toContain('q.from({ item: contactsCollection })')
    })

    it('should generate get hook (useContact)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'get',
            operationId: 'get_contact',
            localFirst: true,
            responses: [{
              statusCode: '200',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useContact(id: string)')
      expect(contactsCode).toContain('.where(({ item }) => eq(item.id, id))')
    })

    it('should generate create hook (useCreateContact)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'post',
            operationId: 'create_contact',
            localFirst: true,
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { ref: '#/components/schemas/ContactCreate' } } },
            },
            responses: [{
              statusCode: '201',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [
          { name: 'Contact', properties: [], type: 'object' },
          { name: 'ContactCreate', properties: [], type: 'object' },
        ],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useCreateContact()')
      expect(contactsCode).toContain('contactsCollection.insert(data')
      expect(contactsCode).toContain('// TanStack DB mutations are optimistic')
    })

    it('should generate update hook (useUpdateContact)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'patch',
            operationId: 'update_contact',
            localFirst: true,
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { ref: '#/components/schemas/ContactUpdate' } } },
            },
            responses: [{
              statusCode: '200',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [
          { name: 'Contact', properties: [], type: 'object' },
          { name: 'ContactUpdate', properties: [], type: 'object' },
        ],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useUpdateContact()')
      expect(contactsCode).toContain('contactsCollection.update(id, (draft) => Object.assign(draft, data))')
    })

    it('should generate delete hook (useDeleteContact)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'delete',
            operationId: 'delete_contact',
            localFirst: true,
            responses: [{ statusCode: '204' }],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useDeleteContact()')
      expect(contactsCode).toContain('contactsCollection.delete(id)')
    })

    it('should import correct TanStack DB packages', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: true,
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain("import { useLiveQuery } from '@tanstack/react-db'")
      expect(contactsCode).toContain("import { eq } from '@tanstack/db'")
    })

    it('should re-export related schemas', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            responses: [{
              statusCode: '200',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [
          { name: 'Contact', properties: [], type: 'object' },
          { name: 'ContactCreate', properties: [], type: 'object' },
        ],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export type {')
      expect(contactsCode).toContain('Contact,')
      expect(contactsCode).toContain("} from '../schemas/index'")
    })

    it('should not generate wrapper for entity without CRUD operations', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/health',
            method: 'get',
            operationId: 'health_check',
            responses: [],
          }),
        ],
        schemas: [],
      })

      const result = generateEntityWrappers(parsedAPI)

      expect(result.wrappers.size).toBe(0)
    })

    it('should generate types file', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)

      expect(result.types).toContain('export interface UnifiedQueryResult<T>')
      expect(result.types).toContain('export interface UnifiedMutationResult<TData, TVariables>')
    })

    it('should generate index file with exports', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/tasks', method: 'get', operationId: 'list_tasks' }),
        ],
        schemas: [
          { name: 'Contact', properties: [], type: 'object' },
          { name: 'Task', properties: [], type: 'object' },
        ],
      })

      const result = generateEntityWrappers(parsedAPI)

      expect(result.index).toContain("export * from './types'")
      expect(result.index).toContain("export * from './contacts'")
      expect(result.index).toContain("export * from './tasks'")
    })
  })

  describe('fallback to Query hooks', () => {
    it('should use Query hooks when not local_first', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            localFirst: false,
            responses: [{
              statusCode: '200',
              content: { 'application/json': { schema: { ref: '#/components/schemas/Contact' } } },
            }],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('hooks.useListContacts()')
      expect(contactsCode).not.toContain('useLiveQuery')
    })
  })
})
