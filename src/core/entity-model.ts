/**
 * Entity Model - Core Types
 *
 * The canonical intermediate representation for code generation.
 * All generators consume this - no re-parsing of OpenAPI.
 */

/**
 * Sync mode determines how data is synchronized
 */
export type SyncMode = 'api' | 'realtime' | 'offline'

/**
 * The canonical intermediate representation.
 * All generators consume this - no re-parsing.
 */
export interface EntityModel {
  /** API metadata */
  info: ApiInfo

  /** Entity definitions keyed by plural name */
  entities: Map<string, EntityDefinition>

  /** Non-entity schemas (e.g., ValidationError, shared types) */
  sharedSchemas: SchemaDefinition[]

  /** Auth configuration */
  auth: AuthConfig
}

export interface ApiInfo {
  title: string
  version: string
  description?: string
  baseUrl?: string
}

export interface EntityDefinition {
  /** Plural name: 'accounts' */
  name: string
  /** Singular name: 'account' */
  singular: string
  /** PascalCase: 'Account' */
  pascalName: string
  /** Sync mode from x-sync-mode extension */
  syncMode: SyncMode

  /** Standard CRUD operations (detected from endpoints) */
  operations: CrudOperations

  /** Non-CRUD operations (e.g., /accounts/{id}/transition) */
  customOperations: OperationDefinition[]

  /** Metadata endpoint if detected */
  metadataOperation?: OperationDefinition

  /** Related schema names */
  schemas: EntitySchemas
}

export interface CrudOperations {
  list?: OperationDefinition
  get?: OperationDefinition
  create?: OperationDefinition
  update?: OperationDefinition
  delete?: OperationDefinition
}

export interface OperationDefinition {
  /** Original operationId from OpenAPI */
  operationId: string
  /** HTTP method */
  method: HttpMethod
  /** Full path: '/api/v1/accounts/{account_id}' */
  path: string
  /** Summary/description */
  summary?: string
  /** Path parameters */
  pathParams: ParameterDefinition[]
  /** Query parameters */
  queryParams: ParameterDefinition[]
  /** Request body schema (for POST/PUT/PATCH) */
  requestSchema?: SchemaReference
  /** Response schema (200/201) */
  responseSchema?: SchemaReference
  /** Whether auth is required */
  requiresAuth: boolean
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface EntitySchemas {
  /** List response type: 'AccountListResponse' */
  listResponse?: string
  /** Single item type: 'Account' */
  item?: string
  /** Create request type: 'AccountCreate' */
  createRequest?: string
  /** Update request type: 'AccountUpdate' */
  updateRequest?: string
}

export interface SchemaDefinition {
  name: string
  type: 'object' | 'enum' | 'array' | 'primitive'
  properties?: Record<string, PropertyDefinition>
  enumValues?: (string | number)[]
  required?: string[]
  description?: string
}

export interface PropertyDefinition {
  name: string
  type: string
  format?: string
  nullable?: boolean
  description?: string
  ref?: string
}

export interface ParameterDefinition {
  name: string
  type: string
  format?: string
  required: boolean
  description?: string
  default?: unknown
  enumValues?: (string | number)[]
}

export interface SchemaReference {
  /** Schema name (e.g., 'AccountListResponse') */
  name: string
  /** Whether the response is an array of this type */
  isArray: boolean
  /** For paginated responses: the property containing the array */
  arrayProperty?: string
}

export interface AuthConfig {
  type: 'bearer' | 'apiKey' | 'oauth2' | 'none'
  headerName?: string
  schemes: AuthScheme[]
}

export interface AuthScheme {
  name: string
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: string
  bearerFormat?: string
}

/**
 * Helper to create an empty EntityModel
 */
export function createEmptyEntityModel(): EntityModel {
  return {
    info: { title: '', version: '' },
    entities: new Map(),
    sharedSchemas: [],
    auth: { type: 'none', schemes: [] },
  }
}

/**
 * Helper to create an empty EntityDefinition
 */
export function createEmptyEntityDefinition(name: string): EntityDefinition {
  const singular = singularize(name)
  return {
    name,
    singular,
    pascalName: toPascalCase(singular),
    syncMode: 'api',
    operations: {},
    customOperations: [],
    schemas: {},
  }
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

/**
 * Simple singularization (handles common cases)
 */
export function singularize(str: string): string {
  if (str.endsWith('ies')) {
    return str.slice(0, -3) + 'y'
  }
  if (str.endsWith('ses') || str.endsWith('xes') || str.endsWith('ches') || str.endsWith('shes')) {
    return str.slice(0, -2)
  }
  if (str.endsWith('s') && !str.endsWith('ss')) {
    return str.slice(0, -1)
  }
  return str
}
