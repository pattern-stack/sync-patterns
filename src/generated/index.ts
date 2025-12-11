/**
 * Generated API
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 *
 * PUBLIC API:
 *   - Entity wrappers (entities/) - THE interface for all data operations
 *   - Schema types (schemas/) - TypeScript types for all entities
 *   - Config (config.ts) - Runtime configuration
 *
 * INTERNAL (do not import directly):
 *   - client/ - Low-level API client
 *   - hooks/ - TanStack Query hooks
 *   - collections/ - TanStack DB collections
 */

// Entity wrappers - THE public API for data operations
// (Each entity module re-exports its related schema types)
export * from './entities/index'

// Aggregated entities hook for entity-agnostic pages
export { useEntities, hasEntity, getEntityNames, type Entities, type EntityApi } from './entities-hook'

// Runtime configuration
export { configureSync, isLocalFirst, getElectricUrl, getSyncConfig } from './config'
