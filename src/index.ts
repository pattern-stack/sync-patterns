/**
 * sync-patterns
 *
 * Generate typed clients from OpenAPI specs with Zod runtime validation
 */

// Re-export generators
export * from './generators/index.js'

// Re-export types
export type { ParsedOpenAPI, ParsedSchema, ParsedEndpoint } from './generators/parser.js'
export type { GeneratedZodSchemas, ZodGeneratorOptions } from './generators/zod-generator.js'
