/**
 * Generate Command
 *
 * Main entry point for code generation from OpenAPI specs
 */

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { loadOpenAPISpec, parseOpenAPI } from '../../generators/parser.js'
import { generateZodSchemas } from '../../generators/zod-generator.js'
import { generateAPIClient } from '../../generators/client-generator.js'
import { generateHooks } from '../../generators/hook-generator.js'
import { generateCollections } from '../../generators/collection-generator.js'
import { generateEntityWrappers } from '../../generators/entity-generator.js'
import { generateConfig } from '../../generators/config-generator.js'

export interface GenerateOptions {
  output: string
  schemas: boolean
  client: boolean
  hooks: boolean
  collections: boolean
  entities: boolean
  apiUrl?: string
  apiUrlEnv?: string
  timeout?: string
  authTokenKey?: string
  dryRun?: boolean
  verbose?: boolean
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Directory might already exist
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  await fs.writeFile(path, content, 'utf8')
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export async function generateCommand(
  source: string,
  options: GenerateOptions
): Promise<void> {
  try {
    console.log('sync-patterns generate')
    console.log('======================')
    console.log()

    // Load and parse OpenAPI specification
    console.log(`Loading OpenAPI spec from: ${source}`)
    const spec = await loadOpenAPISpec(source)
    console.log(`Loaded: ${spec.info.title} v${spec.info.version}`)

    console.log('Parsing specification...')
    const parsed = await parseOpenAPI(spec)
    console.log(
      `Found ${parsed.endpoints.length} endpoints, ${parsed.schemas.length} schemas`
    )

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would generate:')
      if (options.schemas) {
        console.log(`  - Zod schemas in ${options.output}/schemas/`)
      }
      if (options.client) {
        console.log(`  - API client in ${options.output}/client/`)
      }
      if (options.hooks) {
        console.log(`  - React hooks in ${options.output}/hooks/`)
      }
      if (options.collections) {
        console.log(`  - TanStack DB collections in ${options.output}/collections/`)
      }
      if (options.entities) {
        console.log(`  - Entity wrappers in ${options.output}/entities/`)
        console.log(`  - Runtime config in ${options.output}/config.ts`)
      }
      return
    }

    // Generate Zod schemas
    if (options.schemas) {
      console.log('\nGenerating Zod schemas...')
      const schemas = generateZodSchemas(parsed)

      // Write schema files
      const schemasDir = join(options.output, 'schemas')
      await ensureDir(schemasDir)

      for (const [name, content] of schemas.schemas) {
        const fileName = `${toKebabCase(name)}.schema.ts`
        const filePath = join(schemasDir, fileName)
        await writeFile(filePath, content)
        if (options.verbose) {
          console.log(`  Written: ${filePath}`)
        }
      }

      // Write entity barrel files (e.g., accounts.ts groups account-related schemas)
      for (const [entityName, content] of schemas.entityBarrels) {
        const fileName = `${toKebabCase(entityName)}.ts`
        const filePath = join(schemasDir, fileName)
        await writeFile(filePath, content)
        if (options.verbose) {
          console.log(`  Written entity barrel: ${filePath}`)
        }
      }

      // Write index file
      await writeFile(join(schemasDir, 'index.ts'), schemas.index)
      console.log(`Written ${schemas.schemas.size} schemas + ${schemas.entityBarrels.size} entity barrels to ${schemasDir}/`)

      if (options.verbose) {
        // Show a sample schema
        const firstSchema = schemas.schemas.values().next().value
        if (firstSchema) {
          console.log('\nSample generated schema:')
          console.log('------------------------')
          console.log(firstSchema)
        }
      }
    }

    // Generate API client
    if (options.client) {
      console.log('\nGenerating API client...')
      const client = generateAPIClient(parsed, {
        baseUrl: options.apiUrl,
        apiUrlEnvVar: options.apiUrlEnv || 'VITE_API_URL',
        timeout: options.timeout ? parseInt(options.timeout, 10) : 10000,
        authTokenKey: options.authTokenKey || 'auth_token',
      })

      // Write client files
      const clientDir = join(options.output, 'client')
      await ensureDir(clientDir)

      await writeFile(join(clientDir, 'client.ts'), client.client)
      await writeFile(join(clientDir, 'methods.ts'), client.methods)
      await writeFile(join(clientDir, 'types.ts'), client.types)
      await writeFile(join(clientDir, 'config.ts'), client.config)
      await writeFile(join(clientDir, 'index.ts'), client.index)

      console.log(`Written API client to ${clientDir}/`)
    }

    // Generate React hooks
    if (options.hooks) {
      console.log('\nGenerating React hooks...')
      const hooks = await generateHooks(parsed)

      // Write hook files
      const hooksDir = join(options.output, 'hooks')
      await ensureDir(hooksDir)

      await writeFile(join(hooksDir, 'queries.ts'), hooks.queries)
      await writeFile(join(hooksDir, 'mutations.ts'), hooks.mutations)
      await writeFile(join(hooksDir, 'keys.ts'), hooks.keys)
      await writeFile(join(hooksDir, 'types.ts'), hooks.types)
      await writeFile(join(hooksDir, 'index.ts'), hooks.index)

      console.log(`Written React hooks to ${hooksDir}/`)
    }

    // Generate TanStack DB collections (for local_first: true entities)
    if (options.collections) {
      console.log('\nGenerating TanStack DB collections...')
      const collections = generateCollections(parsed)

      const totalCollections = collections.realtimeCollections.size + collections.offlineCollections.size
      if (totalCollections > 0) {
        const collectionsDir = join(options.output, 'collections')
        await ensureDir(collectionsDir)

        // Write realtime collections (ElectricSQL)
        for (const [name, content] of collections.realtimeCollections) {
          const fileName = `${toKebabCase(name)}.realtime.ts`
          const filePath = join(collectionsDir, fileName)
          await writeFile(filePath, content)
          if (options.verbose) {
            console.log(`  Written: ${filePath}`)
          }
        }

        // Write offline collections (RxDB)
        for (const [name, content] of collections.offlineCollections) {
          const fileName = `${toKebabCase(name)}.offline.ts`
          const filePath = join(collectionsDir, fileName)
          await writeFile(filePath, content)
          if (options.verbose) {
            console.log(`  Written: ${filePath}`)
          }
        }

        await writeFile(join(collectionsDir, 'index.ts'), collections.index)
        console.log(`Written ${totalCollections} collections to ${collectionsDir}/`)
      } else {
        console.log('  No local_first: true entities found, skipping collections')
      }
    }

    // Generate runtime config
    if (options.entities) {
      console.log('\nGenerating runtime config...')
      const configResult = generateConfig(parsed)
      await writeFile(join(options.output, 'config.ts'), configResult.config)
      console.log(`Written config to ${options.output}/config.ts`)
    }

    // Generate entity wrappers (the public API)
    if (options.entities) {
      console.log('\nGenerating entity wrappers...')
      const entities = generateEntityWrappers(parsed)

      if (entities.wrappers.size > 0) {
        const entitiesDir = join(options.output, 'entities')
        await ensureDir(entitiesDir)

        for (const [name, content] of entities.wrappers) {
          const fileName = `${toKebabCase(name)}.ts`
          const filePath = join(entitiesDir, fileName)
          await writeFile(filePath, content)
          if (options.verbose) {
            console.log(`  Written: ${filePath}`)
          }
        }

        await writeFile(join(entitiesDir, 'index.ts'), entities.index)
        await writeFile(join(entitiesDir, 'types.ts'), entities.types)
        console.log(`Written ${entities.wrappers.size} entity wrappers to ${entitiesDir}/`)
      } else {
        console.log('  No entities with CRUD operations found')
      }
    }

    // Generate root index
    console.log('\nGenerating root index...')

    // Root index exports entities (public API) + schemas (types)
    // Internal modules (client, hooks, collections) are NOT exported
    const rootIndexLines: string[] = [
      '/**',
      ' * Generated API',
      ' *',
      ' * Auto-generated from OpenAPI specification',
      ' * Do not edit manually - regenerate using sync-patterns CLI',
      ' *',
      ' * PUBLIC API:',
      ' *   - Entity wrappers (entities/) - THE interface for all data operations',
      ' *   - Schema types (schemas/) - TypeScript types for all entities',
      ' *   - Config (config.ts) - Runtime configuration',
      ' *',
      ' * INTERNAL (do not import directly):',
      ' *   - client/ - Low-level API client',
      ' *   - hooks/ - TanStack Query hooks',
      ' *   - collections/ - TanStack DB collections',
      ' */',
      '',
    ]

    // Export entities if generated (the public API)
    // Note: Entities re-export their related schema types, so we don't need to export schemas separately
    if (options.entities) {
      rootIndexLines.push('// Entity wrappers - THE public API for data operations')
      rootIndexLines.push('// (Each entity module re-exports its related schema types)')
      rootIndexLines.push("export * from './entities/index'")
      rootIndexLines.push('')
      rootIndexLines.push('// Runtime configuration')
      rootIndexLines.push("export { configureSync, isLocalFirst, getElectricUrl, getSyncConfig } from './config'")
      rootIndexLines.push('')
    } else {
      // No entities - export schemas and hooks directly
      if (options.schemas) {
        rootIndexLines.push('// Schema types')
        rootIndexLines.push("export * from './schemas/index'")
        rootIndexLines.push('')
      }
      if (options.hooks) {
        rootIndexLines.push('// React hooks')
        rootIndexLines.push("export * from './hooks/index'")
        rootIndexLines.push('')
      }
    }

    await writeFile(join(options.output, 'index.ts'), rootIndexLines.join('\n'))

    // Generate a types.ts alias for convenience
    const typesAlias = `/**
 * Type Re-exports
 *
 * Convenience re-export of all schema types
 */

export * from './schemas/index'
`
    await writeFile(join(options.output, 'types.ts'), typesAlias)

    console.log('\n✅ Generation complete!')
    console.log(`📦 Generated files in: ${options.output}`)
  } catch (error) {
    console.error('❌ Generation failed:')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
