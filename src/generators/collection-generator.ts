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
  /** Map of entity name to offline collection code (RxDB) */
  offlineCollections: Map<string, string>
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
    const offlineCollections = new Map<string, string>()

    // Extract entities by sync mode
    const { realtimeEntities, offlineEntities } = this.extractEntitiesBySyncMode(parsedAPI.endpoints)

    // Generate realtime collections (ElectricSQL)
    for (const [entityName, endpoint] of Object.entries(realtimeEntities)) {
      const code = this.generateRealtimeCollectionFile(entityName, endpoint)
      realtimeCollections.set(entityName, code)
    }

    // Generate offline collections (RxDB)
    for (const [entityName, endpoint] of Object.entries(offlineEntities)) {
      const code = this.generateOfflineCollectionFile(entityName, endpoint)
      offlineCollections.set(entityName, code)
    }

    // Generate index file
    const index = this.generateIndexFile(
      Array.from(realtimeCollections.keys()),
      Array.from(offlineCollections.keys())
    )

    return { realtimeCollections, offlineCollections, index }
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

  private generateOfflineCollectionFile(entityName: string, endpoint: ParsedEndpoint): string {
    const lines: string[] = []
    const singularName = this.singularize(entityName)
    const pascalSingular = this.toPascalCase(singularName)
    const camelName = this.toCamelCase(entityName)
    const kebabName = this.toKebabCase(entityName)
    const collectionName = `${camelName}OfflineCollection`

    // File header
    lines.push(this.generateFileHeader(`${pascalSingular} Offline`))
    lines.push('')

    // Imports
    lines.push("import { createCollection } from '@tanstack/db'")
    lines.push("import { rxdbCollectionOptions } from '@tanstack/rxdb-db-collection'")
    lines.push("import { getRxDatabase } from '../db/rxdb-init'")
    lines.push(`import type { ${pascalSingular}Document } from '../db/schemas/${kebabName}.schema'`)
    lines.push('')

    // JSDoc for collection
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * TanStack DB RxDB offline collection for ${pascalSingular}`)
      lines.push(' *')
      lines.push(' * Features:')
      lines.push(' * - Persistent storage via IndexedDB')
      lines.push(' * - Survives browser refresh')
      lines.push(' * - Background sync when online')
      lines.push(' * - Optimistic mutations')
      lines.push(' *')
      if (endpoint.summary) {
        lines.push(` * ${endpoint.summary}`)
      }
      lines.push(' */')
    }

    // Generate collection
    lines.push(`export const ${collectionName} = createCollection<${pascalSingular}Document>(`)
    lines.push('  rxdbCollectionOptions({')
    lines.push('    getRxCollection: async () => {')
    lines.push('      const db = await getRxDatabase()')
    lines.push(`      return db.${entityName}`)
    lines.push('    },')
    lines.push('    getKey: (item) => item.id,')
    lines.push('  })')
    lines.push(')')
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
    lines.push(' * - Offline: RxDB (IndexedDB, persistent)')
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

    // Export offline collections
    if (offlineEntities.length > 0) {
      lines.push('// Offline collections (RxDB - IndexedDB, persistent)')
      for (const entityName of offlineEntities.sort()) {
        const camelName = this.toCamelCase(entityName)
        const fileName = this.toKebabCase(entityName)
        lines.push(`export { ${camelName}OfflineCollection } from './${fileName}.offline'`)
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
