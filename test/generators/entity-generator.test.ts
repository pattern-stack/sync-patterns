/**
 * Entity Generator Tests
 *
 * Tests for unified entity wrapper code generation with 3-mode sync support.
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

    it('should use getSyncMode instead of isLocalFirst', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
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

      expect(contactsCode).toContain("import { getSyncMode } from '../config'")
      expect(contactsCode).toContain("const mode = getSyncMode('contacts')")
      expect(contactsCode).not.toContain('isLocalFirst')
    })

    it('should import realtime collection for syncMode: realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain("import { contactsRealtimeCollection } from '../collections/contacts.realtime'")
      expect(contactsCode).not.toContain('contactsOfflineCollection')
    })

    it('should import offline actions for syncMode: offline', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'offline',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      // Offline mode uses OfflineExecutor actions pattern
      expect(contactsCode).toContain("from '../offline/contacts.actions'")
      expect(contactsCode).toContain('createOfflineContact')
      // Note: Entity generator imports BOTH realtime collection AND offline actions
      // for entities with non-api syncMode, to support 3-mode switching
      expect(contactsCode).toContain("if (mode === 'offline')")
    })

    it('should not import any collection for syncMode: api', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'api',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).not.toContain('contactsRealtimeCollection')
      expect(contactsCode).not.toContain('contactsOfflineCollection')
      expect(contactsCode).not.toContain('useLiveQuery')
      expect(contactsCode).not.toContain('getSyncMode')
    })

    it('should generate 3-mode switch in list hook for realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
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
      expect(contactsCode).toContain("const mode = getSyncMode('contacts')")
      expect(contactsCode).toContain("if (mode === 'realtime')")
      expect(contactsCode).toContain('useLiveQuery')
      expect(contactsCode).toContain('q.from({ item: contactsRealtimeCollection })')
      expect(contactsCode).toContain('// api mode - use TanStack Query')
    })

    it('should generate 3-mode switch in list hook for offline', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'offline',
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
      expect(contactsCode).toContain("if (mode === 'offline')")
      // Offline mode uses TanStack Query (offline executor handles mutations)
      expect(contactsCode).toContain('hooks.useListContacts()')
    })

    it('should generate 3-mode switch in get hook', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'get',
            operationId: 'get_contact',
            syncMode: 'realtime',
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
      expect(contactsCode).toContain("if (mode === 'realtime')")
      expect(contactsCode).toContain('.where(({ item }) => eq(item.id, id))')
      expect(contactsCode).toContain('q.from({ item: contactsRealtimeCollection })')
    })

    it('should generate 3-mode mutation for create hook', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'post',
            operationId: 'create_contact',
            syncMode: 'realtime',
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
      expect(contactsCode).toContain("if (mode === 'realtime')")
      expect(contactsCode).toContain('contactsRealtimeCollection.insert')
      expect(contactsCode).toContain('crypto.randomUUID()')
      expect(contactsCode).toContain('isPending: false, // Optimistic - always instant')
    })

    it('should handle backward compat localFirst: true as realtime', () => {
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

      // localFirst: true should be treated as realtime mode
      expect(contactsCode).toContain("if (mode === 'realtime')")
      expect(contactsCode).toContain('contactsRealtimeCollection')
      expect(contactsCode).toContain("import { getSyncMode } from '../config'")
    })

    it('should use correct collection/action names for realtime and offline', () => {
      const parsedAPIRealtime = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const parsedAPIOffline = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/drafts',
            method: 'get',
            operationId: 'list_drafts',
            syncMode: 'offline',
            responses: [],
          }),
        ],
        schemas: [{ name: 'Draft', properties: [], type: 'object' }],
      })

      const resultRealtime = generateEntityWrappers(parsedAPIRealtime)
      const resultOffline = generateEntityWrappers(parsedAPIOffline)

      const contactsCode = resultRealtime.wrappers.get('contacts')!
      const draftsCode = resultOffline.wrappers.get('drafts')!

      // Realtime uses ElectricSQL collection
      expect(contactsCode).toContain('contactsRealtimeCollection')
      // Offline uses OfflineExecutor actions
      expect(draftsCode).toContain('createOfflineDraft')
    })

    it('should generate update hook with correct collection', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'patch',
            operationId: 'update_contact',
            syncMode: 'realtime',
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
      expect(contactsCode).toContain('contactsRealtimeCollection.update')
      expect(contactsCode).toContain('updated_at: new Date().toISOString()')
    })

    it('should generate delete hook with correct collection', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts/{id}',
            method: 'delete',
            operationId: 'delete_contact',
            syncMode: 'realtime',
            responses: [{ statusCode: '204' }],
          }),
        ],
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('export function useDeleteContact()')
      expect(contactsCode).toContain('contactsRealtimeCollection.delete(id)')
    })

    it('should import correct TanStack DB packages for realtime mode', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
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
    it('should use Query hooks when syncMode is api', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'api',
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

    it('should use Query hooks when localFirst is false (backward compat)', () => {
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

    it('should default to api mode when no syncMode or localFirst specified', () => {
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
        schemas: [{ name: 'Contact', properties: [], type: 'object' }],
      })

      const result = generateEntityWrappers(parsedAPI)
      const contactsCode = result.wrappers.get('contacts')!

      expect(contactsCode).toContain('hooks.useListContacts()')
      expect(contactsCode).not.toContain('useLiveQuery')
      expect(contactsCode).not.toContain('getSyncMode')
    })

    it('should generate useContactsWithMeta hook (SYNC-009)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            operationId: 'list_contacts',
            syncMode: 'realtime',
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

      // Check metadata hook is generated
      expect(contactsCode).toContain('function useContactsMetadata(')
      expect(contactsCode).toContain("queryKey: ['contacts', 'metadata', view]")
      expect(contactsCode).toContain('staleTime: 30 * 60 * 1000')

      // Check WithMeta hook is generated
      expect(contactsCode).toContain('export function useContactsWithMeta(')
      expect(contactsCode).toContain("options?: { view?: 'list' | 'detail' | 'form' }")
      expect(contactsCode).toContain('UnifiedQueryResultWithMeta<Contact[]>')

      // Check it combines data and metadata
      expect(contactsCode).toContain('const query = useContacts()')
      expect(contactsCode).toContain('const meta = useContactsMetadata(view)')

      // Check useMemo is used
      expect(contactsCode).toContain('return useMemo(() => ({')
      expect(contactsCode).toContain('columns: meta.columns')
      expect(contactsCode).toContain('isLoadingMetadata: meta.isLoading')
      expect(contactsCode).toContain('metadataError: meta.error')
      expect(contactsCode).toContain('isReady: !query.isLoading && !meta.isLoading')
    })

  })
})

describe('EntityGenerator SYNC-009', () => {
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

  it('should include UnifiedQueryResultWithMeta import in entity wrapper', () => {
    const parsedAPI = createParsedAPI({
      endpoints: [
        createEndpoint({
          path: '/contacts',
          method: 'get',
          operationId: 'list_contacts',
          syncMode: 'realtime',
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

    // Check that entity wrapper imports the new type
    expect(contactsCode).toContain('UnifiedQueryResultWithMeta')
    expect(contactsCode).toContain("import type { UnifiedQueryResult, UnifiedMutationResult, UnifiedQueryResultWithMeta } from './types'")
  })
})
