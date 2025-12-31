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
  type SyncMode,
} from './parser.js'

// Zod Schema Generator
export {
  ZodSchemaGenerator,
  generateZodSchemas,
  type GeneratedZodSchemas,
  type ZodGeneratorOptions,
} from './zod-generator.js'

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

// Column Metadata Generator (UI metadata from schemas)
export {
  ColumnMetadataGenerator,
  generateColumnMetadata,
  type GeneratedColumnMetadata,
  type ColumnMetadataGeneratorOptions,
} from './column-metadata-generator.js'

// Field Renderer Generator (UIType → React component mapping)
export {
  FieldRendererGenerator,
  generateFieldRenderers,
  type GeneratedFieldRenderers,
  type FieldRendererGeneratorOptions,
} from './field-renderer-generator.js'

// Entity Config Generator (semantic field mapping)
export {
  EntityConfigGenerator,
  generateEntityConfigs,
  type GeneratedEntityConfigs,
  type EntityConfigGeneratorOptions,
} from './entity-config-generator.js'

// Column Hook Generator (runtime column metadata fetching)
export {
  ColumnHookGenerator,
  generateColumnHooks,
  type GeneratedColumnHooks,
  type ColumnHookGeneratorOptions,
} from './column-hook-generator.js'
