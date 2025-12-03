/**
 * Config Generator
 *
 * Generates runtime configuration module for sync-patterns.
 * Bakes in default values from OpenAPI x-sync extensions at generation time,
 * allowing runtime overrides.
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'

export interface GeneratedConfig {
  config: string
}

export interface ConfigGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ConfigGeneratorOptions> = {
  includeJSDoc: true,
}

export class ConfigGenerator {
  private options: Required<ConfigGeneratorOptions>

  constructor(options: ConfigGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedConfig {
    const config = this.generateConfigFile(parsedAPI.endpoints)
    return { config }
  }

  private generateConfigFile(endpoints: ParsedEndpoint[]): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader())
    lines.push('')

    // Extract entity configurations
    const entityConfigs = this.extractEntityConfigs(endpoints)

    // Type definition
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Sync configuration interface')
      lines.push(' */')
    }
    lines.push('export interface SyncConfig {')
    lines.push('  /** Electric sync service URL */')
    lines.push('  electricUrl: string')
    lines.push('  /** Default local-first behavior for entities not explicitly configured */')
    lines.push('  defaultLocalFirst: boolean')
    lines.push('  /** Per-entity local-first configuration */')
    lines.push('  entities: Record<string, boolean>')
    lines.push('}')
    lines.push('')

    // Default configuration
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Default configuration baked in from OpenAPI x-sync extensions')
      lines.push(' * Can be overridden at runtime via configureSync()')
      lines.push(' */')
    }
    lines.push('let config: SyncConfig = {')
    lines.push("  electricUrl: '',")
    lines.push('  defaultLocalFirst: false,')
    lines.push('  entities: {')

    // Add entity configurations
    const sortedEntities = Object.entries(entityConfigs).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    for (const [entityName, localFirst] of sortedEntities) {
      lines.push(`    ${entityName}: ${localFirst},`)
    }

    lines.push('  },')
    lines.push('}')
    lines.push('')

    // configureSync function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Configure sync settings at runtime')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * ```typescript')
      lines.push(' * import { configureSync } from "@/generated/config"')
      lines.push(' *')
      lines.push(' * configureSync({')
      lines.push(' *   electricUrl: "https://electric.example.com",')
      lines.push(' *   defaultLocalFirst: true,')
      lines.push(' *   entities: {')
      lines.push(' *     contacts: true,  // Override to enable local-first')
      lines.push(' *     analytics: false // Override to disable local-first')
      lines.push(' *   }')
      lines.push(' * })')
      lines.push(' * ```')
      lines.push(' */')
    }
    lines.push('export function configureSync(overrides: Partial<SyncConfig>): void {')
    lines.push('  config = {')
    lines.push('    ...config,')
    lines.push('    ...overrides,')
    lines.push('    entities: {')
    lines.push('      ...config.entities,')
    lines.push('      ...overrides.entities,')
    lines.push('    },')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // isLocalFirst function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Check if an entity is configured for local-first mode')
      lines.push(' *')
      lines.push(' * @param entity Entity name (e.g., "contacts", "accounts")')
      lines.push(' * @returns true if entity uses local-first (optimistic) mode')
      lines.push(' */')
    }
    lines.push('export function isLocalFirst(entity: string): boolean {')
    lines.push('  return config.entities[entity] ?? config.defaultLocalFirst')
    lines.push('}')
    lines.push('')

    // getElectricUrl function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured Electric sync service URL')
      lines.push(' *')
      lines.push(' * @throws {Error} if Electric URL is not configured')
      lines.push(' * @returns Electric service URL')
      lines.push(' */')
    }
    lines.push('export function getElectricUrl(): string {')
    lines.push('  if (!config.electricUrl) {')
    lines.push(
      "    throw new Error('Electric URL not configured. Call configureSync() first.')"
    )
    lines.push('  }')
    lines.push('  return config.electricUrl')
    lines.push('}')
    lines.push('')

    // getSyncConfig function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the current sync configuration')
      lines.push(' *')
      lines.push(' * @returns A copy of the current configuration')
      lines.push(' */')
    }
    lines.push('export function getSyncConfig(): SyncConfig {')
    lines.push('  return { ...config, entities: { ...config.entities } }')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Extract entity configurations from endpoints
   */
  private extractEntityConfigs(endpoints: ParsedEndpoint[]): Record<string, boolean> {
    const configs: Record<string, boolean> = {}

    for (const endpoint of endpoints) {
      // Only process endpoints with explicit local_first configuration
      if (endpoint.localFirst !== undefined) {
        const entityName = this.extractEntityName(endpoint.path)
        if (entityName) {
          // Only set if not already configured (first endpoint wins)
          if (!(entityName in configs)) {
            configs[entityName] = endpoint.localFirst
          }
        }
      }
    }

    return configs
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

  private generateFileHeader(): string {
    return `/**
 * Sync Configuration
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 *
 * This module manages runtime configuration for sync-patterns,
 * including Electric URL and per-entity local-first settings.
 */`
  }
}

// Factory function for easy usage
export function generateConfig(
  parsedAPI: ParsedOpenAPI,
  options?: ConfigGeneratorOptions
): GeneratedConfig {
  const generator = new ConfigGenerator(options)
  return generator.generate(parsedAPI)
}
