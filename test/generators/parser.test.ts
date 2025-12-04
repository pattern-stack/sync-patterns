/**
 * Parser Tests
 *
 * Tests for OpenAPI spec parsing functionality.
 */

import { describe, it, expect } from 'vitest'
import { parseOpenAPI } from '../../src/generators/parser.js'
import type { OpenAPIV3 } from 'openapi-types'

describe('Parser', () => {
  describe('parseOpenAPI', () => {
    it('should parse a minimal OpenAPI spec', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        paths: {},
      }

      const result = await parseOpenAPI(spec)

      expect(result.info.title).toBe('Test API')
      expect(result.info.version).toBe('1.0.0')
      expect(result.endpoints).toHaveLength(0)
      expect(result.schemas).toHaveLength(0)
    })

    it('should parse endpoints with operationIds', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/contacts': {
            get: {
              operationId: 'list_contacts',
              summary: 'List all contacts',
              responses: {
                '200': {
                  description: 'List of contacts',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Contact' },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = await parseOpenAPI(spec)

      expect(result.endpoints).toHaveLength(1)
      expect(result.endpoints[0].operationId).toBe('list_contacts')
      expect(result.endpoints[0].method).toBe('get')
      expect(result.endpoints[0].path).toBe('/contacts')
    })

    it('should parse x-sync extensions', async () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/contacts': {
            'x-sync': {
              local_first: true,
            },
            get: {
              operationId: 'list_contacts',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      } as OpenAPIV3.Document

      const result = await parseOpenAPI(spec)

      expect(result.endpoints).toHaveLength(1)
      expect(result.endpoints[0].localFirst).toBe(true)
    })

    it('should parse schemas with properties', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Contact: {
              type: 'object',
              description: 'A contact record',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                email: { type: 'string', format: 'email', nullable: true },
              },
            },
          },
        },
      }

      const result = await parseOpenAPI(spec)

      expect(result.schemas).toHaveLength(1)
      expect(result.schemas[0].name).toBe('Contact')
      expect(result.schemas[0].description).toBe('A contact record')
      // properties is an object, not an array
      expect(result.schemas[0].properties).toBeDefined()
    })

    it('should parse enum schemas', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Status: {
              type: 'string',
              enum: ['active', 'inactive', 'pending'],
            },
          },
        },
      }

      const result = await parseOpenAPI(spec)

      expect(result.schemas).toHaveLength(1)
      expect(result.schemas[0].name).toBe('Status')
      expect(result.schemas[0].enum).toEqual(['active', 'inactive', 'pending'])
    })

    it('should parse path parameters', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/contacts/{contact_id}': {
            get: {
              operationId: 'get_contact',
              parameters: [
                {
                  name: 'contact_id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string', format: 'uuid' },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      }

      const result = await parseOpenAPI(spec)

      expect(result.endpoints).toHaveLength(1)
      expect(result.endpoints[0].path).toBe('/contacts/{contact_id}')
      expect(result.endpoints[0].parameters).toHaveLength(1)
      expect(result.endpoints[0].parameters[0].name).toBe('contact_id')
      expect(result.endpoints[0].parameters[0].in).toBe('path')
    })

    it('should parse request body', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/contacts': {
            post: {
              operationId: 'create_contact',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ContactCreate' },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      }

      const result = await parseOpenAPI(spec)

      expect(result.endpoints).toHaveLength(1)
      expect(result.endpoints[0].requestBody).toBeDefined()
      expect(result.endpoints[0].requestBody?.required).toBe(true)
    })
  })
})
