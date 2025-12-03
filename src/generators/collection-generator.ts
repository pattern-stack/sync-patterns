/**
 * TanStack DB Collection Generator
 *
 * Generates Electric collections for entities with local_first: true.
 * These collections integrate with ElectricSQL for real-time sync and
 * provide optimistic mutation handling.
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'

export interface GeneratedCollections {
  /** Map of entity name to collection code */
  collections: Map<string, string>
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
    const collections = new Map<string, string>()

    // Find all entities with local_first: true
    const localFirstEntities = this.extractLocalFirstEntities(parsedAPI.endpoints)

    for (const [entityName, endpoint] of Object.entries(localFirstEntities)) {
      const code = this.generateCollectionFile(entityName, endpoint)
      collections.set(entityName, code)
    }

    // Generate index file
    const index = this.generateIndexFile(Array.from(collections.keys()))

    return { collections, index }
  }

  /**
   * Extract entities that have local_first: true from endpoints
   */
  private extractLocalFirstEntities(
    endpoints: ParsedEndpoint[]
  ): Record<string, ParsedEndpoint> {
    const entities: Record<string, ParsedEndpoint> = {}

    for (const endpoint of endpoints) {
      // Check if endpoint has local_first: true
      if (endpoint.localFirst === true) {
        // Extract entity name from path (e.g., /contacts -> contacts)
        const entityName = this.extractEntityName(endpoint.path)
        if (entityName && !entities[entityName]) {
          entities[entityName] = endpoint
        }
      }
    }

    return entities
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

  private generateCollectionFile(entityName: string, endpoint: ParsedEndpoint): string {
    const lines: string[] = []
    const pascalName = this.toPascalCase(entityName)
    const camelName = this.toCamelCase(entityName)
    const collectionName = `${camelName}Collection`

    // File header
    lines.push(this.generateFileHeader(pascalName))
    lines.push('')

    // Imports
    lines.push("import { createCollection } from '@tanstack/react-db'")
    lines.push(
      "import { electricCollectionOptions } from '@tanstack/electric-db-collection'"
    )
    lines.push("import { getElectricUrl } from '../config.js'")
    lines.push(
      `import { ${pascalName}Schema } from '../schemas/${this.toKebabCase(entityName)}.schema.js'`
    )
    lines.push(`import { apiClient } from '../client/index.js'`)
    lines.push('')

    // JSDoc for collection
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * TanStack DB Electric collection for ${pascalName}`)
      lines.push(' *')
      lines.push(' * Features:')
      lines.push(' * - Real-time sync via ElectricSQL')
      lines.push(' * - Optimistic mutations')
      lines.push(' * - Automatic conflict resolution')
      lines.push(' *')
      if (endpoint.summary) {
        lines.push(` * ${endpoint.summary}`)
      }
      lines.push(' */')
    }

    // Generate collection
    lines.push(`export const ${collectionName} = createCollection(`)
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
    lines.push('    getKey: (item) => item.id,')
    lines.push(`    schema: ${pascalName}Schema,`)
    lines.push('')
    lines.push('    // Mutation handlers - call API and return txid')
    lines.push('    onInsert: async ({ transaction }) => {')
    lines.push('      const item = transaction.mutations[0].modified')
    lines.push(
      `      const response = await apiClient.post<{ txid: string }>('/${entityName}', item)`
    )
    lines.push('      return { txid: response.txid }')
    lines.push('    },')
    lines.push('')
    lines.push('    onUpdate: async ({ transaction }) => {')
    lines.push('      const { original, changes } = transaction.mutations[0]')
    lines.push(
      `      const response = await apiClient.patch<{ txid: string }>(\`/${entityName}/\${original.id}\`, changes)`
    )
    lines.push('      return { txid: response.txid }')
    lines.push('    },')
    lines.push('')
    lines.push('    onDelete: async ({ transaction }) => {')
    lines.push('      const { original } = transaction.mutations[0]')
    lines.push(
      `      const response = await apiClient.delete<{ txid: string }>(\`/${entityName}/\${original.id}\`)`
    )
    lines.push('      return { txid: response.txid }')
    lines.push('    },')
    lines.push('  })')
    lines.push(')')
    lines.push('')

    return lines.join('\n')
  }

  private generateIndexFile(entityNames: string[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Collections Index'))
    lines.push('')
    lines.push('/**')
    lines.push(' * TanStack DB Electric Collections')
    lines.push(' *')
    lines.push(' * Auto-generated collections for entities with local_first: true')
    lines.push(' */')
    lines.push('')

    // Export all collections
    for (const entityName of entityNames.sort()) {
      const camelName = this.toCamelCase(entityName)
      const fileName = this.toKebabCase(entityName)
      lines.push(`export { ${camelName}Collection } from './${fileName}.js'`)
    }

    if (entityNames.length === 0) {
      lines.push('// No local-first entities found in OpenAPI spec')
    }

    lines.push('')

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
}

// Factory function for easy usage
export function generateCollections(
  parsedAPI: ParsedOpenAPI,
  options?: CollectionGeneratorOptions
): GeneratedCollections {
  const generator = new CollectionGenerator(options)
  return generator.generate(parsedAPI)
}
