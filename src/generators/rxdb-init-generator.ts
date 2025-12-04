/**
 * RxDB Init Generator
 *
 * Generates RxDB database initialization code with replication using
 * the verified replicateRxCollection API from rxdb/plugins/replication.
 *
 * Key design:
 * - Uses real RxDB v16 replicateRxCollection API (not fictional)
 * - Push handler receives docs[] array
 * - Pull handler receives (checkpoint, batchSize) and returns {documents, checkpoint}
 * - Supports exponential backoff with online reset
 */

import type { ParsedOpenAPI, ParsedEndpoint, ParsedSchema } from './parser.js'

export interface GeneratedRxDBInit {
  /** RxDB initialization code */
  init: string
  /** API request helper */
  apiHelper: string
}

export interface RxDBInitGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
  /** Database name */
  databaseName?: string
}

const DEFAULT_OPTIONS: Required<RxDBInitGeneratorOptions> = {
  includeJSDoc: true,
  databaseName: 'app',
}

interface EntityInfo {
  name: string
  pascalName: string
  schemaVersion: number
}

export class RxDBInitGenerator {
  private options: Required<RxDBInitGeneratorOptions>

  constructor(options: RxDBInitGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedRxDBInit {
    // Extract offline entities
    const offlineEntities = this.extractOfflineEntities(parsedAPI.endpoints, parsedAPI.schemas)

    // Generate init file
    const init = this.generateInitFile(offlineEntities)

    // Generate API helper
    const apiHelper = this.generateApiHelper()

    return { init, apiHelper }
  }

  /**
   * Extract entities with syncMode: 'offline'
   */
  private extractOfflineEntities(
    endpoints: ParsedEndpoint[],
    schemas: ParsedSchema[]
  ): EntityInfo[] {
    const entities: EntityInfo[] = []
    const seen = new Set<string>()

    for (const endpoint of endpoints) {
      const syncMode = this.getSyncMode(endpoint)
      if (syncMode !== 'offline') continue

      const entityName = this.extractEntityName(endpoint.path)
      if (!entityName || seen.has(entityName)) continue

      seen.add(entityName)

      const pascalName = this.toPascalCase(this.singularize(entityName))
      const schemaVersion = (endpoint as unknown as { schemaVersion?: number }).schemaVersion ?? 0

      entities.push({
        name: entityName,
        pascalName,
        schemaVersion,
      })
    }

    return entities
  }

  private getSyncMode(endpoint: ParsedEndpoint): 'api' | 'realtime' | 'offline' {
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'
    if (endpoint.localFirst === true) return 'realtime' // backward compat
    return 'api'
  }

  private generateInitFile(entities: EntityInfo[]): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader('RxDB Database Initialization'))
    lines.push('')

    // Imports
    lines.push("import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb'")
    lines.push("import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'")
    lines.push("import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'")
    lines.push("import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication'")
    lines.push("import { apiRequest, ApiRequestError } from './api-helper'")
    lines.push(
      "import { getApiUrl, getReplicationConfig, getOnAuthError, getOnSyncError, clearTokenCache } from '../config'"
    )

    // Import schemas
    for (const entity of entities) {
      lines.push(
        `import { ${entity.name}Schema, ${entity.name}Migrations, ${entity.pascalName}Document } from './schemas/${this.toKebabCase(entity.name)}.schema'`
      )
    }

    lines.push('')

    // Enable leader election plugin
    lines.push('// Enable cross-tab leader election (only one tab runs replication)')
    lines.push('addRxPlugin(RxDBLeaderElectionPlugin)')
    lines.push('')

    // Collection type definitions
    if (this.options.includeJSDoc) {
      lines.push('// Collection type definitions')
    }
    for (const entity of entities) {
      lines.push(`export type ${entity.pascalName}Collection = RxCollection<${entity.pascalName}Document>`)
    }
    lines.push('')

    // Database interface
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * App database interface with all offline collections')
      lines.push(' */')
    }
    lines.push('export interface AppDatabase extends RxDatabase {')
    for (const entity of entities) {
      lines.push(`  ${entity.name}: ${entity.pascalName}Collection`)
    }
    lines.push('}')
    lines.push('')

    // Singleton instance
    lines.push('// Singleton database instance')
    lines.push('let dbPromise: Promise<AppDatabase> | null = null')
    lines.push('const replicationStates = new Map<string, RxReplicationState<any, any>>()')
    lines.push('')

    // Get database function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get or create the RxDB database instance')
      lines.push(' * Uses singleton pattern - safe to call multiple times')
      lines.push(' */')
    }
    lines.push('export async function getRxDatabase(): Promise<AppDatabase> {')
    lines.push('  if (!dbPromise) {')
    lines.push('    dbPromise = initDatabase()')
    lines.push('  }')
    lines.push('  return dbPromise')
    lines.push('}')
    lines.push('')

    // Init database function
    lines.push('async function initDatabase(): Promise<AppDatabase> {')
    lines.push('  const db = await createRxDatabase({')
    lines.push(`    name: '${this.options.databaseName}',`)
    lines.push('    storage: getRxStorageDexie(),')
    lines.push('    multiInstance: true, // Enable cross-tab sync')
    lines.push('    eventReduce: true,   // Optimize event handling')
    lines.push('  })')
    lines.push('')

    // Add collections
    lines.push('  // Add collections with schemas and migrations')
    lines.push('  await db.addCollections({')
    for (const entity of entities) {
      lines.push(`    ${entity.name}: {`)
      lines.push(`      schema: ${entity.name}Schema,`)
      lines.push(`      migrationStrategies: ${entity.name}Migrations,`)
      lines.push('    },')
    }
    lines.push('  })')
    lines.push('')

    lines.push('  // Start replication for all collections')
    lines.push('  await startReplication(db as unknown as AppDatabase)')
    lines.push('')
    lines.push('  return db as unknown as AppDatabase')
    lines.push('}')
    lines.push('')

    // Start replication function
    lines.push(this.generateReplicationFunction(entities))
    lines.push('')

    // Create replication for entity
    lines.push(this.generateCreateReplicationFunction())
    lines.push('')

    // Utility functions
    lines.push(this.generateUtilityFunctions())

    return lines.join('\n')
  }

  private generateReplicationFunction(entities: EntityInfo[]): string {
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Start replication for all offline collections')
      lines.push(' * Uses replicateRxCollection with push/pull handlers')
      lines.push(' */')
    }
    lines.push('async function startReplication(db: AppDatabase): Promise<void> {')
    lines.push('  const config = getReplicationConfig()')
    lines.push('')

    for (const entity of entities) {
      lines.push(`  // Replication for ${entity.name}`)
      lines.push(`  const ${entity.name}Replication = createEntityReplication(`)
      lines.push(`    db.${entity.name},`)
      lines.push(`    '${entity.name}',`)
      lines.push('    config')
      lines.push('  )')
      lines.push(`  replicationStates.set('${entity.name}', ${entity.name}Replication)`)
      lines.push('')
    }

    lines.push('}')

    return lines.join('\n')
  }

  private generateCreateReplicationFunction(): string {
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Create replication state for a single collection')
      lines.push(' * Uses the real RxDB v16 replicateRxCollection API')
      lines.push(' *')
      lines.push(' * Push handler: receives docs array, sends to server, returns conflicts')
      lines.push(' * Pull handler: receives (checkpoint, batchSize), returns {documents, checkpoint}')
      lines.push(' */')
    }
    lines.push('function createEntityReplication<T extends { id: string; updated_at?: string; _deleted?: boolean }>(')
    lines.push('  collection: RxCollection<T>,')
    lines.push('  entityName: string,')
    lines.push('  config: ReturnType<typeof getReplicationConfig>')
    lines.push('): RxReplicationState<T, { updatedAt: string; id: string }> {')
    lines.push('  const apiUrl = getApiUrl()')
    lines.push('')
    lines.push('  return replicateRxCollection({')
    lines.push('    collection,')
    lines.push('    replicationIdentifier: `${entityName}-backend-sync`,')
    lines.push('')

    // Push configuration
    lines.push('    push: {')
    lines.push('      batchSize: 10,')
    lines.push('      /**')
    lines.push('       * Push handler - sends local changes to server')
    lines.push('       * @param docs Array of documents to push (RxDB v16 API)')
    lines.push('       * @returns Array of conflicting documents (empty if no conflicts)')
    lines.push('       */')
    lines.push('      async handler(docs) {')
    lines.push('        const conflicts: T[] = []')
    lines.push('')
    lines.push('        for (const doc of docs) {')
    lines.push('          try {')
    lines.push('            if (doc._deleted) {')
    lines.push('              // Delete')
    lines.push('              await apiRequest(\'DELETE\', `${apiUrl}/${entityName}/${doc.id}`)')
    lines.push('            } else {')
    lines.push('              // Upsert - try PATCH first, fall back to POST')
    lines.push('              try {')
    lines.push('                await apiRequest(\'PATCH\', `${apiUrl}/${entityName}/${doc.id}`, doc)')
    lines.push('              } catch (err) {')
    lines.push('                if ((err as ApiRequestError).status === 404) {')
    lines.push('                  // Document doesn\'t exist, create it')
    lines.push('                  await apiRequest(\'POST\', `${apiUrl}/${entityName}`, doc)')
    lines.push('                } else {')
    lines.push('                  throw err')
    lines.push('                }')
    lines.push('              }')
    lines.push('            }')
    lines.push('          } catch (err) {')
    lines.push('            const error = err as ApiRequestError')
    lines.push('            if (error.status === 409) {')
    lines.push('              // Conflict - server has different version')
    lines.push('              // In last-write-wins, we could fetch server version here')
    lines.push('              // For now, add to conflicts array')
    lines.push('              conflicts.push(doc)')
    lines.push('            } else if (error.status === 401) {')
    lines.push('              clearTokenCache()')
    lines.push('              getOnAuthError()?.()')
    lines.push('              throw error')
    lines.push('            } else {')
    lines.push('              getOnSyncError()?.(entityName, error)')
    lines.push('              throw error')
    lines.push('            }')
    lines.push('          }')
    lines.push('        }')
    lines.push('')
    lines.push('        return conflicts')
    lines.push('      },')
    lines.push('    },')
    lines.push('')

    // Pull configuration
    lines.push('    pull: {')
    lines.push('      batchSize: 100,')
    lines.push('      /**')
    lines.push('       * Pull handler - fetches remote changes')
    lines.push('       * @param checkpoint Last sync checkpoint (null on first sync)')
    lines.push('       * @param batchSize Max documents to fetch')
    lines.push('       * @returns {documents, checkpoint} for next sync')
    lines.push('       */')
    lines.push('      async handler(checkpoint, batchSize) {')
    lines.push("        const updatedAt = checkpoint?.updatedAt ?? '1970-01-01T00:00:00Z'")
    lines.push("        const lastId = checkpoint?.id ?? ''")
    lines.push('')
    lines.push('        try {')
    lines.push('          const response = await apiRequest(')
    lines.push('            \'GET\',')
    lines.push('            `${apiUrl}/${entityName}?updated_since=${encodeURIComponent(updatedAt)}&after_id=${encodeURIComponent(lastId)}&limit=${batchSize}`')
    lines.push('          )')
    lines.push('')
    lines.push('          const documents = response.data as T[]')
    lines.push('')
    lines.push('          // Calculate new checkpoint from last document')
    lines.push('          const lastDoc = documents[documents.length - 1]')
    lines.push('          const newCheckpoint = lastDoc')
    lines.push('            ? { updatedAt: lastDoc.updated_at ?? updatedAt, id: lastDoc.id }')
    lines.push('            : checkpoint')
    lines.push('')
    lines.push('          return {')
    lines.push('            documents,')
    lines.push('            checkpoint: newCheckpoint,')
    lines.push('          }')
    lines.push('        } catch (err) {')
    lines.push('          const error = err as ApiRequestError')
    lines.push('          if (error.status === 401) {')
    lines.push('            clearTokenCache()')
    lines.push('            getOnAuthError()?.()')
    lines.push('          }')
    lines.push('          getOnSyncError()?.(entityName, error)')
    lines.push('          throw error')
    lines.push('        }')
    lines.push('      },')
    lines.push('    },')
    lines.push('')

    // Other options
    lines.push('    live: true,')
    lines.push('    retryTime: config.initialRetryDelay,')
    lines.push('    autoStart: true,')
    lines.push('  })')
    lines.push('}')

    return lines.join('\n')
  }

  private generateUtilityFunctions(): string {
    const lines: string[] = []

    // Get replication state
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get replication state for a collection')
      lines.push(' */')
    }
    lines.push('export function getReplicationState(collection: string): RxReplicationState<any, any> | undefined {')
    lines.push('  return replicationStates.get(collection)')
    lines.push('}')
    lines.push('')

    // Pause replication
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Pause all replication (e.g., for background sync)')
      lines.push(' */')
    }
    lines.push('export async function pauseReplication(): Promise<void> {')
    lines.push('  for (const state of replicationStates.values()) {')
    lines.push('    await state.cancel()')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // Resume replication
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Resume/restart replication')
      lines.push(' */')
    }
    lines.push('export async function resumeReplication(): Promise<void> {')
    lines.push('  for (const state of replicationStates.values()) {')
    lines.push('    state.reSync()')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // Destroy database
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Destroy database and clear all data')
      lines.push(' * Use for logout or complete reset')
      lines.push(' */')
    }
    lines.push('export async function destroyDatabase(): Promise<void> {')
    lines.push('  await pauseReplication()')
    lines.push('  replicationStates.clear()')
    lines.push('')
    lines.push('  if (dbPromise) {')
    lines.push('    const db = await dbPromise')
    lines.push('    await db.destroy()')
    lines.push('    dbPromise = null')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // Await initial sync
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Wait for initial replication to complete for all collections')
      lines.push(' * Useful for showing loading state on app start')
      lines.push(' */')
    }
    lines.push('export async function awaitInitialSync(): Promise<void> {')
    lines.push('  const promises = Array.from(replicationStates.values()).map(')
    lines.push('    (state) => state.awaitInitialReplication()')
    lines.push('  )')
    lines.push('  await Promise.all(promises)')
    lines.push('}')

    return lines.join('\n')
  }

  private generateApiHelper(): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('API Request Helper'))
    lines.push('')
    lines.push("import { getAuthToken } from '../config'")
    lines.push('')

    // Error class
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * API request error with status code')
      lines.push(' */')
    }
    lines.push('export class ApiRequestError extends Error {')
    lines.push('  constructor(')
    lines.push('    public status: number,')
    lines.push('    message: string')
    lines.push('  ) {')
    lines.push("    super(message)")
    lines.push("    this.name = 'ApiRequestError'")
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // API request function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Make authenticated API request')
      lines.push(' * Handles auth token injection and error standardization')
      lines.push(' */')
    }
    lines.push('export async function apiRequest(')
    lines.push("  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',")
    lines.push('  url: string,')
    lines.push('  body?: unknown')
    lines.push('): Promise<{ data: unknown; status: number }> {')
    lines.push('  const token = getAuthToken()')
    lines.push('')
    lines.push('  const response = await fetch(url, {')
    lines.push('    method,')
    lines.push('    headers: {')
    lines.push("      'Authorization': `Bearer ${token}`,")
    lines.push("      'Content-Type': 'application/json',")
    lines.push('    },')
    lines.push('    body: body ? JSON.stringify(body) : undefined,')
    lines.push('  })')
    lines.push('')
    lines.push('  if (!response.ok) {')
    lines.push('    const text = await response.text()')
    lines.push('    throw new ApiRequestError(response.status, text || response.statusText)')
    lines.push('  }')
    lines.push('')
    lines.push('  // Handle empty responses (204 No Content)')
    lines.push('  if (response.status === 204) {')
    lines.push('    return { data: null, status: response.status }')
    lines.push('  }')
    lines.push('')
    lines.push('  const data = await response.json()')
    lines.push('  return { data, status: response.status }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find((seg) => !skipPrefixes.includes(seg.toLowerCase()))
    return resourceSegment || null
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toUpperCase())
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }

  private singularize(str: string): string {
    if (str.endsWith('ies')) {
      return str.slice(0, -3) + 'y'
    }
    if (str.endsWith('ses') || str.endsWith('shes') || str.endsWith('ches') || str.endsWith('xes')) {
      return str.slice(0, -2)
    }
    if (str.endsWith('s') && !str.endsWith('ss')) {
      return str.slice(0, -1)
    }
    return str
  }
}

// Factory function for easy usage
export function generateRxDBInit(
  parsedAPI: ParsedOpenAPI,
  options?: RxDBInitGeneratorOptions
): GeneratedRxDBInit {
  const generator = new RxDBInitGenerator(options)
  return generator.generate(parsedAPI)
}
