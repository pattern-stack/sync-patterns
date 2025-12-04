/**
 * OpenAPI Parser
 *
 * Core parser that reads OpenAPI 3.0 specifications and converts them
 * into an intermediate representation for code generation.
 *
 * Migrated from frontend-patterns to sync-patterns
 */

import type { OpenAPIV3 } from 'openapi-types'
import { promises as fs } from 'fs'
import { resolve } from 'path'

// Core types for our intermediate representation
export interface ParsedOpenAPI {
  info: {
    title: string
    version: string
    description?: string
  }
  servers: ParsedServer[]
  endpoints: ParsedEndpoint[]
  schemas: ParsedSchema[]
  security: ParsedSecurity[]
}

export interface ParsedServer {
  url: string
  description?: string
  variables?: Record<string, string>
}

/**
 * Sync mode determines how data is synchronized
 * - 'api': Server-only, uses TanStack Query (no local storage)
 * - 'realtime': ElectricSQL + TanStack DB (in-memory, sub-ms reactivity)
 * - 'offline': RxDB + IndexedDB (persistent, survives refresh)
 */
export type SyncMode = 'api' | 'realtime' | 'offline'

export interface ParsedEndpoint {
  path: string
  method: HTTPMethod
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters: ParsedParameter[]
  requestBody?: ParsedRequestBody
  responses: ParsedResponse[]
  security?: ParsedSecurity[]
  // Sync extensions (new 3-mode format)
  syncMode?: SyncMode
  schemaVersion?: number
  // Legacy sync extensions (backward compatibility)
  localFirst?: boolean
  syncConfig?: {
    localFirst: boolean
  }
}

export interface ParsedParameter {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required: boolean
  schema: ParsedSchema
  description?: string
}

export interface ParsedRequestBody {
  required: boolean
  content: Record<string, ParsedMediaType>
  description?: string
}

export interface ParsedResponse {
  statusCode: string
  description?: string
  content?: Record<string, ParsedMediaType>
  headers?: Record<string, ParsedSchema>
}

export interface ParsedMediaType {
  schema: ParsedSchema
}

export interface ParsedSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null' | 'any'
  name?: string // Schema name from components/schemas
  format?: string
  items?: ParsedSchema
  properties?: Record<string, ParsedSchema>
  required?: string[]
  enum?: unknown[]
  description?: string
  example?: unknown
  nullable?: boolean
  ref?: string // For $ref resolution
  originalRef?: string // Keep track of original $ref
  // Sync extensions
  syncExclude?: boolean
  ownerOnly?: boolean
}

export interface ParsedSecurity {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: string // For http type
  bearerFormat?: string
  in?: 'query' | 'header' | 'cookie' // For apiKey
  name?: string // For apiKey
  flows?: Record<string, unknown> // For oauth2
  openIdConnectUrl?: string
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'

// Main parser class
export class OpenAPIParser {
  private spec: OpenAPIV3.Document
  private refs: Map<string, unknown> = new Map()

  constructor(spec: OpenAPIV3.Document) {
    this.spec = spec
    this.buildRefsMap()
  }

  /**
   * Parse the OpenAPI specification into our intermediate representation
   */
  parse(): ParsedOpenAPI {
    return {
      info: this.parseInfo(),
      servers: this.parseServers(),
      endpoints: this.parseEndpoints(),
      schemas: this.parseSchemas(),
      security: this.parseSecurity(),
    }
  }

  private parseInfo() {
    return {
      title: this.spec.info.title,
      version: this.spec.info.version,
      description: this.spec.info.description,
    }
  }

  private parseServers(): ParsedServer[] {
    if (!this.spec.servers) return []

    return this.spec.servers.map((server) => ({
      url: server.url,
      description: server.description,
      variables: server.variables
        ? Object.fromEntries(
            Object.entries(server.variables).map(([key, variable]) => [
              key,
              variable.default || '',
            ])
          )
        : undefined,
    }))
  }

  private parseEndpoints(): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = []

    for (const [path, pathItem] of Object.entries(this.spec.paths || {})) {
      if (!pathItem) continue

      // Check for x-sync extension at path level
      const pathExtensions = pathItem as Record<string, unknown>
      const pathSyncConfig = pathExtensions['x-sync'] as Record<string, unknown> | undefined

      const methods: HTTPMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

      for (const method of methods) {
        const operation = pathItem[method]
        if (!operation) continue

        // Check for x-sync extension at operation level
        const opExtensions = operation as Record<string, unknown>
        const opSyncConfig = opExtensions['x-sync'] as Record<string, unknown> | undefined
        const syncConfig = opSyncConfig || pathSyncConfig

        // Extract sync mode with backward compatibility
        const extractedSyncMode = this.extractSyncMode(syncConfig)

        endpoints.push({
          path,
          method,
          operationId: operation.operationId,
          summary: operation.summary,
          description: operation.description,
          tags: operation.tags,
          parameters: this.parseParameters(operation.parameters),
          requestBody: operation.requestBody
            ? this.parseRequestBody(operation.requestBody)
            : undefined,
          responses: this.parseResponses(operation.responses),
          security: operation.security ? this.parseOperationSecurity() : undefined,
          // Sync extensions (new 3-mode format)
          syncMode: extractedSyncMode,
          schemaVersion: syncConfig?.schema_version as number | undefined,
          // Legacy sync extensions (backward compatibility)
          localFirst: syncConfig?.local_first as boolean | undefined,
          syncConfig: syncConfig?.local_first !== undefined
            ? { localFirst: syncConfig.local_first as boolean }
            : undefined,
        })
      }
    }

    return endpoints
  }

  private parseParameters(
    parameters?: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[]
  ): ParsedParameter[] {
    if (!parameters) return []

    return parameters.map((param) => {
      const resolved = this.resolveRef(param) as OpenAPIV3.ParameterObject
      return {
        name: resolved.name,
        in: resolved.in as ParsedParameter['in'],
        required: resolved.required || false,
        schema: resolved.schema ? this.parseSchema(resolved.schema) : { type: 'any' as const },
        description: resolved.description,
      }
    })
  }

  private parseRequestBody(
    requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject
  ): ParsedRequestBody {
    const resolved = this.resolveRef(requestBody) as OpenAPIV3.RequestBodyObject

    return {
      required: resolved.required || false,
      description: resolved.description,
      content: Object.fromEntries(
        Object.entries(resolved.content || {}).map(([mediaType, mediaTypeObj]) => [
          mediaType,
          { schema: this.parseSchema(mediaTypeObj.schema) },
        ])
      ),
    }
  }

  private parseResponses(responses: OpenAPIV3.ResponsesObject): ParsedResponse[] {
    return Object.entries(responses).map(([statusCode, response]) => {
      const resolved = this.resolveRef(response) as OpenAPIV3.ResponseObject

      return {
        statusCode,
        description: resolved.description,
        content: resolved.content
          ? Object.fromEntries(
              Object.entries(resolved.content).map(([mediaType, mediaTypeObj]) => [
                mediaType,
                { schema: this.parseSchema(mediaTypeObj.schema) },
              ])
            )
          : undefined,
        headers: resolved.headers
          ? Object.fromEntries(
              Object.entries(resolved.headers).map(([headerName, header]) => [
                headerName,
                this.parseSchema((this.resolveRef(header) as OpenAPIV3.HeaderObject).schema),
              ])
            )
          : undefined,
      }
    })
  }

  private parseSchema(schema?: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): ParsedSchema {
    if (!schema) {
      return { type: 'any' }
    }

    // Handle $ref
    if ('$ref' in schema) {
      return {
        type: 'any', // Will be resolved later
        ref: schema.$ref,
        originalRef: schema.$ref,
      }
    }

    const resolved = schema as OpenAPIV3.SchemaObject
    const extensions = resolved as Record<string, unknown>

    // Handle array type
    if (resolved.type === 'array') {
      return {
        type: 'array',
        items: this.parseSchema(resolved.items),
        description: resolved.description,
        nullable: resolved.nullable,
        syncExclude: extensions['x-sync-exclude'] as boolean | undefined,
        ownerOnly: extensions['x-owner-only'] as boolean | undefined,
      }
    }

    // Handle object type
    if (resolved.type === 'object' || resolved.properties) {
      return {
        type: 'object',
        properties: resolved.properties
          ? Object.fromEntries(
              Object.entries(resolved.properties).map(([propName, propSchema]) => [
                propName,
                this.parseSchema(propSchema),
              ])
            )
          : undefined,
        required: resolved.required,
        description: resolved.description,
        nullable: resolved.nullable,
        syncExclude: extensions['x-sync-exclude'] as boolean | undefined,
        ownerOnly: extensions['x-owner-only'] as boolean | undefined,
      }
    }

    // Handle primitive types
    const type = this.mapOpenAPIType(resolved.type as string)

    return {
      type,
      format: resolved.format,
      enum: resolved.enum,
      description: resolved.description,
      example: resolved.example,
      nullable: resolved.nullable,
      syncExclude: extensions['x-sync-exclude'] as boolean | undefined,
      ownerOnly: extensions['x-owner-only'] as boolean | undefined,
    }
  }

  private parseSchemas(): ParsedSchema[] {
    if (!this.spec.components?.schemas) return []

    return Object.entries(this.spec.components.schemas).map(([name, schema]) => ({
      ...this.parseSchema(schema),
      name,
      ref: `#/components/schemas/${name}`,
    }))
  }

  private parseSecurity(): ParsedSecurity[] {
    if (!this.spec.components?.securitySchemes) return []

    return Object.entries(this.spec.components.securitySchemes).map(([, scheme]) => {
      const resolved = this.resolveRef(scheme) as OpenAPIV3.SecuritySchemeObject

      return {
        type: resolved.type as ParsedSecurity['type'],
        scheme: 'scheme' in resolved ? resolved.scheme : undefined,
        bearerFormat: 'bearerFormat' in resolved ? resolved.bearerFormat : undefined,
        in: 'in' in resolved ? (resolved.in as ParsedSecurity['in']) : undefined,
        name: 'name' in resolved ? resolved.name : undefined,
        flows: 'flows' in resolved ? resolved.flows : undefined,
        openIdConnectUrl: 'openIdConnectUrl' in resolved ? resolved.openIdConnectUrl : undefined,
      }
    })
  }

  private parseOperationSecurity(): ParsedSecurity[] {
    // Simplified - would need to match with security schemes
    return []
  }

  /**
   * Extract sync mode from x-sync extension with backward compatibility
   *
   * New format: x-sync.mode: 'api' | 'realtime' | 'offline'
   * Legacy format: x-sync.local_first: true → 'realtime' (preserves existing behavior)
   *                x-sync.local_first: false → 'api'
   *
   * Default: 'api' (server-only)
   */
  private extractSyncMode(syncConfig: Record<string, unknown> | undefined): SyncMode | undefined {
    if (!syncConfig) return undefined

    // New format: explicit mode
    const mode = syncConfig.mode as string | undefined
    if (mode === 'api' || mode === 'realtime' || mode === 'offline') {
      return mode
    }

    // Legacy format: local_first boolean
    // IMPORTANT: local_first: true maps to 'realtime' NOT 'offline'
    // This preserves backward compatibility with existing ElectricSQL usage
    const localFirst = syncConfig.local_first as boolean | undefined
    if (localFirst === true) {
      return 'realtime'
    }
    if (localFirst === false) {
      return 'api'
    }

    return undefined
  }

  private mapOpenAPIType(type: string): ParsedSchema['type'] {
    switch (type) {
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'integer':
        return 'integer'
      case 'boolean':
        return 'boolean'
      case 'array':
        return 'array'
      case 'object':
        return 'object'
      case 'null':
        return 'null'
      default:
        return 'any'
    }
  }

  private buildRefsMap() {
    // Build a map of all $ref targets for quick resolution
    this.traverseAndMapRefs(this.spec as unknown as Record<string, unknown>, '')
  }

  private traverseAndMapRefs(obj: Record<string, unknown>, currentPath: string) {
    if (typeof obj !== 'object' || obj === null) return

    for (const [key, value] of Object.entries(obj)) {
      const path = currentPath ? `${currentPath}/${key}` : key

      if (key === '$ref' && typeof value === 'string') {
        // Don't store the ref itself, we'll resolve it when needed
        continue
      }

      if (typeof value === 'object' && value !== null) {
        // Store objects that could be referenced
        if (currentPath.includes('/components/')) {
          this.refs.set(`#/${path}`, value)
        }
        this.traverseAndMapRefs(value as Record<string, unknown>, path)
      }
    }
  }

  private resolveRef(item: unknown): unknown {
    if (typeof item === 'object' && item !== null && '$ref' in item) {
      const ref = (item as { $ref: string }).$ref
      const resolved = this.refs.get(ref)
      if (!resolved) {
        throw new Error(`Could not resolve reference: ${ref}`)
      }
      return resolved
    }
    return item
  }
}

// Factory function for easy usage
export async function parseOpenAPI(spec: OpenAPIV3.Document): Promise<ParsedOpenAPI> {
  const parser = new OpenAPIParser(spec)
  return parser.parse()
}

// Utility function to load OpenAPI from URL or file
export async function loadOpenAPISpec(source: string): Promise<OpenAPIV3.Document> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // Load from URL
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to load OpenAPI spec from ${source}: ${response.statusText}`)
    }
    return response.json() as Promise<OpenAPIV3.Document>
  } else {
    // Try to parse as JSON string first
    try {
      return JSON.parse(source) as OpenAPIV3.Document
    } catch {
      // If JSON parse fails, try to read as file
      try {
        const absolutePath = resolve(source)
        const content = await fs.readFile(absolutePath, 'utf8')
        return JSON.parse(content) as OpenAPIV3.Document
      } catch (fileError) {
        throw new Error(
          `Failed to load OpenAPI spec: Not a valid URL, JSON string, or file path. ${fileError}`
        )
      }
    }
  }
}
