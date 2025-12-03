/**
 * sync-patterns Generators
 *
 * Code generation utilities for creating typed clients from OpenAPI specs
 */

// Parser
export {
  OpenAPIParser,
  parseOpenAPI,
  loadOpenAPISpec,
  type ParsedOpenAPI,
  type ParsedSchema,
  type ParsedEndpoint,
  type ParsedParameter,
  type ParsedRequestBody,
  type ParsedResponse,
  type ParsedServer,
  type ParsedSecurity,
  type HTTPMethod,
} from './parser.js'

// Zod Schema Generator
export {
  ZodSchemaGenerator,
  generateZodSchemas,
  type GeneratedZodSchemas,
  type ZodGeneratorOptions,
} from './zod-generator.js'

// API Client Generator
export {
  APIClientGenerator,
  generateAPIClient,
  type GeneratedClient,
  type ClientGeneratorOptions,
} from './client-generator.js'

// React Hook Generator
export {
  ReactHookGenerator,
  generateHooks,
  type GeneratedHooks,
  type HookGeneratorOptions,
} from './hook-generator.js'

// Naming utilities
export {
  cleanOperationId,
  toCamelCase,
  toPascalCase,
  toHookName,
  toClientMethodName,
  toQueryKeyBase,
  toTypeName,
  getEndpointNames,
  generateFallbackName,
  sanitizeIdentifier,
  extractResourceFromPath,
  pluralize,
  singularize,
} from './naming.js'

// Bulk operation types and utilities
export {
  BulkHookGenerator,
} from './bulk-hook-generator.js'

export {
  isBulkOperation,
  detectBulkOperationType,
  generateBulkOperationName,
  type BulkOperationRequest,
  type BulkOperationOptions,
  type BulkOperationProgress,
  type BulkOperationResponse,
  type BulkOperationResult,
  type BulkOperationError,
  type BulkOperationSummary,
  type BulkRetryConfig,
  type BulkMutationOptions,
} from './bulk-types.js'

// TanStack DB Collection Generator
export {
  CollectionGenerator,
  generateCollections,
  type GeneratedCollections,
  type CollectionGeneratorOptions,
} from './collection-generator.js'

// Config Generator
export {
  ConfigGenerator,
  generateConfig,
  type GeneratedConfig,
  type ConfigGeneratorOptions,
} from './config-generator.js'

// Entity Wrapper Generator
export {
  EntityGenerator,
  generateEntityWrappers,
  type GeneratedEntityWrappers,
  type EntityGeneratorOptions,
} from './entity-generator.js'
