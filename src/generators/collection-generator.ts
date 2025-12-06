/**
 * TanStack DB Collection Generator
 *
 * Generates Electric collections for entities with local_first: true.
 * These collections integrate with ElectricSQL for real-time sync and
 * provide optimistic mutation handling.
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'

export interface GeneratedCollections {
  /** Map of entity name to realtime collection code (ElectricSQL) */
  realtimeCollections: Map<string, string>
  /** Map of entity name to offline action code (OfflineExecutor) */
  offlineActions: Map<string, string>
  /** Offline executor singleton (if any offline entities exist) */
  offlineExecutor: string | null
  /** Combined index file */
  index: string
}

export interface CollectionGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<CollectionGeneratorOptions> = {
  includeJSDoc: true,
}

export class CollectionGenerator {
  private options: Required<CollectionGeneratorOptions>

  constructor(options: CollectionGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedCollections {
    const realtimeCollections = new Map<string, string>()
    const offlineActions = new Map<string, string>()

    // Extract entities by sync mode
    const { realtimeEntities, offlineEntities } = this.extractEntitiesBySyncMode(parsedAPI.endpoints)

    // Generate realtime collections (ElectricSQL)
    for (const [entityName, endpoint] of Object.entries(realtimeEntities)) {
      const code = this.generateRealtimeCollectionFile(entityName, endpoint)
      realtimeCollections.set(entityName, code)
    }

    // Generate offline action files (OfflineExecutor)
    for (const [entityName, endpoint] of Object.entries(offlineEntities)) {
      const code = this.generateOfflineActionsFile(entityName, endpoint)
      offlineActions.set(entityName, code)
    }

    // Generate offline executor singleton if we have offline entities
    const offlineExecutor = Object.keys(offlineEntities).length > 0
      ? this.generateOfflineExecutorFile(Object.keys(offlineEntities))
      : null

    // Generate index file
    const index = this.generateIndexFile(
      Array.from(realtimeCollections.keys()),
      Array.from(offlineActions.keys())
    )

    return { realtimeCollections, offlineActions, offlineExecutor, index }
  }

  /**
   * Get sync mode from endpoint with backward compatibility
   */
  private getSyncMode(endpoint: ParsedEndpoint): 'api' | 'realtime' | 'offline' {
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'
    if (endpoint.localFirst === true) return 'realtime' // backward compat
    return 'api'
  }

  /**
   * Extract entities by sync mode from endpoints
   */
  private extractEntitiesBySyncMode(
    endpoints: ParsedEndpoint[]
  ): { realtimeEntities: Record<string, ParsedEndpoint>; offlineEntities: Record<string, ParsedEndpoint> } {
    const realtimeEntities: Record<string, ParsedEndpoint> = {}
    const offlineEntities: Record<string, ParsedEndpoint> = {}

    for (const endpoint of endpoints) {
      const syncMode = this.getSyncMode(endpoint)
      const entityName = this.extractEntityName(endpoint.path)

      if (!entityName) continue

      if (syncMode === 'realtime' && !realtimeEntities[entityName]) {
        realtimeEntities[entityName] = endpoint
      } else if (syncMode === 'offline' && !offlineEntities[entityName]) {
        offlineEntities[entityName] = endpoint
      }
      // syncMode === 'api' - no collection generated
    }

    return { realtimeEntities, offlineEntities }
  }

  /**
   * Extract entity name from path
   * Examples:
   *   /contacts -> contacts
   *   /api/contacts -> contacts
   *   /v1/contacts -> contacts
   *   /contacts/{id} -> contacts (ignores path params)
   */
  private extractEntityName(path: string): string | null {
    // Remove leading/trailing slashes and split
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))

    // Find the first segment that looks like a resource name (plural noun)
    // Skip common prefixes like 'api', 'v1', 'v2', etc.
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find(
      (seg) => !skipPrefixes.includes(seg.toLowerCase())
    )

    return resourceSegment || null
  }

  private generateRealtimeCollectionFile(entityName: string, endpoint: ParsedEndpoint): string {
    const lines: string[] = []
    const singularName = this.singularize(entityName)
    const pascalSingular = this.toPascalCase(singularName)
    const camelName = this.toCamelCase(entityName)
    const kebabName = this.toKebabCase(entityName)
    const collectionName = `${camelName}RealtimeCollection`

    // File header
    lines.push(this.generateFileHeader(`${pascalSingular} Realtime`))
    lines.push('')

    // Imports
    // TanStack DB core - collection creation
    lines.push("import { createCollection } from '@tanstack/db'")
    // Electric integration - real-time sync with ElectricSQL
    lines.push(
      "import { electricCollectionOptions } from '@tanstack/electric-db-collection'"
    )
    lines.push("import { getElectricUrl, getApiUrl, getAuthToken } from '../config'")
    // Import from entity barrel (e.g., accounts.ts) which exports the primary type alias
    lines.push(`import type { ${pascalSingular} } from '../schemas/${entityName}'`)
    lines.push('')

    // JSDoc for collection
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * TanStack DB Electric realtime collection for ${pascalSingular}`)
      lines.push(' *')
      lines.push(' * Features:')
      lines.push(' * - Real-time sync via ElectricSQL')
      lines.push(' * - In-memory with sub-ms reactivity')
      lines.push(' * - Optimistic mutations')
      lines.push(' * - Automatic conflict resolution')
      lines.push(' *')
      if (endpoint.summary) {
        lines.push(` * ${endpoint.summary}`)
      }
      lines.push(' */')
    }

    // Generate collection
    lines.push(`export const ${collectionName} = createCollection<${pascalSingular}>(`)
    lines.push('  electricCollectionOptions({')
    lines.push(`    id: '${entityName}',`)
    lines.push('')
    lines.push('    // Electric shape configuration')
    lines.push('    shapeOptions: {')
    lines.push('      url: `${getElectricUrl()}/v1/shape`,')
    lines.push('      params: {')
    lines.push(`        table: '${entityName}',`)
    lines.push('      },')
    lines.push('    },')
    lines.push('')
    lines.push('    getKey: (item) => (item as { id: string }).id,')
    lines.push('')
    lines.push('    // Mutation handlers - sync changes to server')
    lines.push('    onInsert: async ({ transaction }) => {')
    lines.push('      const item = transaction.mutations[0].modified')
    lines.push(`      const response = await fetch(\`\${getApiUrl()}/${entityName}\`, {`)
    lines.push("        method: 'POST',")
    lines.push("        headers: {")
    lines.push("          'Content-Type': 'application/json',")
    lines.push("          'Authorization': `Bearer ${getAuthToken()}`,")
    lines.push("        },")
    lines.push('        body: JSON.stringify(item),')
    lines.push('      })')
    lines.push(`      if (!response.ok) throw new Error('Failed to create ${entityName}')`)
    lines.push('      const data = await response.json()')
    lines.push('      return { txid: data.txid ?? data.id }')
    lines.push('    },')
    lines.push('')
    lines.push('    onUpdate: async ({ transaction }) => {')
    lines.push('      const { original, changes } = transaction.mutations[0]')
    lines.push(`      const response = await fetch(\`\${getApiUrl()}/${entityName}/\${original.id}\`, {`)
    lines.push("        method: 'PATCH',")
    lines.push("        headers: {")
    lines.push("          'Content-Type': 'application/json',")
    lines.push("          'Authorization': `Bearer ${getAuthToken()}`,")
    lines.push("        },")
    lines.push('        body: JSON.stringify(changes),')
    lines.push('      })')
    lines.push(`      if (!response.ok) throw new Error('Failed to update ${entityName}')`)
    lines.push('      const data = await response.json()')
    lines.push('      return { txid: data.txid ?? data.id }')
    lines.push('    },')
    lines.push('')
    lines.push('    onDelete: async ({ transaction }) => {')
    lines.push('      const { original } = transaction.mutations[0]')
    lines.push(`      const response = await fetch(\`\${getApiUrl()}/${entityName}/\${original.id}\`, {`)
    lines.push("        method: 'DELETE',")
    lines.push("        headers: {")
    lines.push("          'Authorization': `Bearer ${getAuthToken()}`,")
    lines.push("        },")
    lines.push('      })')
    lines.push(`      if (!response.ok) throw new Error('Failed to delete ${entityName}')`)
    lines.push('      // DELETE may return empty body or confirmation')
    lines.push('      const text = await response.text()')
    lines.push('      const data = text ? JSON.parse(text) : {}')
    lines.push('      return { txid: data.txid ?? original.id }')
    lines.push('    },')
    lines.push('  })')
    lines.push(')')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate offline executor singleton file
   */
  private generateOfflineExecutorFile(entityNames: string[]): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader('Offline Executor'))
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Offline transaction executor singleton')
      lines.push(' *')
      lines.push(' * Manages offline mutations with:')
      lines.push(' * - IndexedDB transaction storage')
      lines.push(' * - Leader election across tabs')
      lines.push(' * - Retry with exponential backoff')
      lines.push(' * - Idempotency keys')
      lines.push(' */')
    }
    lines.push('')

    // Imports
    lines.push("import { createCollection } from '@tanstack/react-db'")
    lines.push("import { queryCollectionOptions } from '@tanstack/query-db-collection'")
    lines.push("import { startOfflineExecutor, IndexedDBAdapter } from '@tanstack/offline-transactions'")
    lines.push("import type { PendingMutation } from '@tanstack/db'")
    lines.push("import { QueryClient } from '@tanstack/react-query'")
    lines.push("import { apiClient } from '../client/index'")
    lines.push('')

    // Query client singleton
    lines.push('// Shared query client for offline operations')
    lines.push('export const offlineQueryClient = new QueryClient()')
    lines.push('')

    // Generate collections for each offline entity
    for (const entityName of entityNames) {
      const pascalName = this.toPascalCase(entityName)
      const singularName = this.singularize(entityName)
      const pascalSingular = this.toPascalCase(singularName)

      lines.push(`// ${pascalName} collection`)
      lines.push(`export const ${entityName}Collection = createCollection(`)
      lines.push('  queryCollectionOptions({')
      lines.push(`    queryKey: ['${entityName}'],`)
      lines.push(`    queryFn: async () => {`)
      lines.push(`      const response = await apiClient.list${pascalName}({})`)
      lines.push(`      return response.items ?? response`)
      lines.push(`    },`)
      lines.push(`    queryClient: offlineQueryClient,`)
      lines.push(`    getKey: (item: { id: string }) => item.id,`)
      lines.push('  })')
      lines.push(')')
      lines.push('')
    }

    // Generate sync functions for each entity
    lines.push('// Sync functions for offline mutations')
    for (const entityName of entityNames) {
      const pascalName = this.toPascalCase(entityName)
      const singularName = this.singularize(entityName)
      const pascalSingular = this.toPascalCase(singularName)

      lines.push(`async function sync${pascalSingular}({`)
      lines.push('  transaction,')
      lines.push('  idempotencyKey,')
      lines.push('}: {')
      lines.push('  transaction: { mutations: Array<PendingMutation> }')
      lines.push('  idempotencyKey: string')
      lines.push('}) {')
      lines.push('  for (const mutation of transaction.mutations) {')
      lines.push("    const headers = { 'Idempotency-Key': idempotencyKey }")
      lines.push("    switch (mutation.type) {")
      lines.push("      case 'insert':")
      lines.push(`        await apiClient.create${pascalSingular}({ data: mutation.modified, headers })`)
      lines.push('        break')
      lines.push("      case 'update':")
      lines.push(`        await apiClient.update${pascalSingular}WithTracking(mutation.key as string, { data: mutation.changes, headers })`)
      lines.push('        break')
      lines.push("      case 'delete':")
      lines.push(`        await apiClient.archive${pascalSingular}(mutation.key as string, { headers })`)
      lines.push('        break')
      lines.push('    }')
      lines.push('  }')
      lines.push(`  await ${entityName}Collection.utils.refetch()`)
      lines.push('}')
      lines.push('')
    }

    // Generate executor with all collections and mutation functions
    lines.push('/**')
    lines.push(' * Global offline executor instance')
    lines.push(' * Shared across all offline entities')
    lines.push(' */')
    lines.push('export const offlineExecutor = startOfflineExecutor({')
    lines.push('  collections: {')
    for (const entityName of entityNames) {
      lines.push(`    ${entityName}: ${entityName}Collection,`)
    }
    lines.push('  },')
    lines.push("  storage: new IndexedDBAdapter('app-db', 'transactions'),")
    lines.push('  mutationFns: {')
    for (const entityName of entityNames) {
      const singularName = this.singularize(entityName)
      const pascalSingular = this.toPascalCase(singularName)
      lines.push(`    sync${pascalSingular},`)
    }
    lines.push('  },')
    lines.push('  onLeadershipChange: (isLeader: boolean) => {')
    lines.push('    if (!isLeader) {')
    lines.push("      console.warn('[Offline] Running in follower mode (another tab is leader)')")
    lines.push('    } else {')
    lines.push("      console.info('[Offline] Running in leader mode')")
    lines.push('    }')
    lines.push('  },')
    lines.push('})')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate offline actions file for an entity
   */
  private generateOfflineActionsFile(entityName: string, endpoint: ParsedEndpoint): string {
    const lines: string[] = []
    const singularName = this.singularize(entityName)
    const pascalSingular = this.toPascalCase(singularName)

    // File header
    lines.push(this.generateFileHeader(`${pascalSingular} Offline Actions`))
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Offline actions for ${pascalSingular}`)
      lines.push(' *')
      lines.push(' * These actions wrap mutations with offline transaction handling:')
      lines.push(' * - Optimistic updates via collection mutations')
      lines.push(' * - Persist pending mutations to IndexedDB')
      lines.push(' * - Sync to server when online')
      lines.push(' */')
    }
    lines.push('')

    // Imports
    lines.push(`import { offlineExecutor, ${entityName}Collection } from './executor'`)
    lines.push(`import type { ${pascalSingular}Create, ${pascalSingular}Update } from '../schemas/index'`)
    lines.push('')

    // Create action
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Create an ${singularName} with offline support`)
      lines.push(' *')
      lines.push(' * Optimistically adds to collection, syncs to server when online.')
      lines.push(' */')
    }
    lines.push(`export function createOffline${pascalSingular}(data: ${pascalSingular}Create) {`)
    lines.push(`  const tx = offlineExecutor.createOfflineTransaction({`)
    lines.push(`    mutationFnName: 'sync${pascalSingular}',`)
    lines.push(`    autoCommit: true,`)
    lines.push(`  })`)
    lines.push(`  tx.mutate(() => {`)
    lines.push('    const newItem = {')
    lines.push('      ...data,')
    lines.push('      id: crypto.randomUUID(),')
    lines.push('      created_at: new Date().toISOString(),')
    lines.push('      updated_at: new Date().toISOString(),')
    lines.push('    }')
    lines.push(`    ${entityName}Collection.insert(newItem)`)
    lines.push('  })')
    lines.push(`  return tx.commit()`)
    lines.push('}')
    lines.push('')

    // Update action
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Update an ${singularName} with offline support`)
      lines.push(' *')
      lines.push(' * Optimistically updates collection, syncs to server when online.')
      lines.push(' */')
    }
    lines.push(`export function updateOffline${pascalSingular}({ id, data }: { id: string; data: ${pascalSingular}Update }) {`)
    lines.push(`  const tx = offlineExecutor.createOfflineTransaction({`)
    lines.push(`    mutationFnName: 'sync${pascalSingular}',`)
    lines.push(`    autoCommit: true,`)
    lines.push(`  })`)
    lines.push(`  tx.mutate(() => {`)
    lines.push(`    ${entityName}Collection.update(id, (draft) => {`)
    lines.push('      Object.assign(draft, data, { updated_at: new Date().toISOString() })')
    lines.push('    })')
    lines.push('  })')
    lines.push(`  return tx.commit()`)
    lines.push('}')
    lines.push('')

    // Delete action
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Delete an ${singularName} with offline support`)
      lines.push(' *')
      lines.push(' * Optimistically removes from collection, syncs to server when online.')
      lines.push(' */')
    }
    lines.push(`export function deleteOffline${pascalSingular}(id: string) {`)
    lines.push(`  const tx = offlineExecutor.createOfflineTransaction({`)
    lines.push(`    mutationFnName: 'sync${pascalSingular}',`)
    lines.push(`    autoCommit: true,`)
    lines.push(`  })`)
    lines.push(`  tx.mutate(() => {`)
    lines.push(`    ${entityName}Collection.delete(id)`)
    lines.push('  })')
    lines.push(`  return tx.commit()`)
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  private generateIndexFile(realtimeEntities: string[], offlineEntities: string[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Collections Index'))
    lines.push('')
    lines.push('/**')
    lines.push(' * TanStack DB Collections')
    lines.push(' *')
    lines.push(' * Auto-generated collections for synced entities')
    lines.push(' * - Realtime: ElectricSQL (in-memory, sub-ms reactivity)')
    lines.push(' */')
    lines.push('')

    // Export realtime collections
    if (realtimeEntities.length > 0) {
      lines.push('// Realtime collections (ElectricSQL - in-memory, sub-ms)')
      for (const entityName of realtimeEntities.sort()) {
        const camelName = this.toCamelCase(entityName)
        const fileName = this.toKebabCase(entityName)
        lines.push(`export { ${camelName}RealtimeCollection } from './${fileName}.realtime'`)
      }
      lines.push('')
    }

    if (realtimeEntities.length === 0 && offlineEntities.length === 0) {
      lines.push('// No synced entities found in OpenAPI spec')
      lines.push('')
    }

    return lines.join('\n')
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title} Collection
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toLowerCase())
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
export function generateCollections(
  parsedAPI: ParsedOpenAPI,
  options?: CollectionGeneratorOptions
): GeneratedCollections {
  const generator = new CollectionGenerator(options)
  return generator.generate(parsedAPI)
}
