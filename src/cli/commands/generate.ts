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
import { generateEntitiesHook } from '../../generators/entities-hook-generator.js'
import { EntityResolver, ApiGenerator, HookGenerator } from '../../core/index.js'
import type { OpenAPIV3 } from 'openapi-types'

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
  useLegacyGenerators?: boolean
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

async function generateWithNewArchitecture(
  spec: OpenAPIV3.Document,
  options: GenerateOptions
): Promise<void> {
  // 1. Resolve to EntityModel
  const resolver = new EntityResolver()
  const model = resolver.resolve(spec)

  console.log(`Resolved ${model.entities.size} entities: ${[...model.entities.keys()].join(', ')}`)

  // 2. Generate API layer (NEW - replaces client-generator)
  if (options.client) {
    console.log('\nGenerating API layer...')
    const apiGenerator = new ApiGenerator()
    const api = apiGenerator.generate(model)

    const apiDir = join(options.output, 'api')
    await ensureDir(apiDir)

    // Write entity files
    for (const [name, content] of api.entities) {
      await writeFile(join(apiDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(apiDir, 'client.ts'), api.client)
    await writeFile(join(apiDir, 'types.ts'), api.types)
    await writeFile(join(apiDir, 'index.ts'), api.index)

    console.log(`Written API layer to ${apiDir}/`)
  }

  // 3. Generate hooks (NEW - replaces hook-generator)
  if (options.hooks) {
    console.log('\nGenerating React hooks...')
    const hookGenerator = new HookGenerator()
    const hooks = hookGenerator.generate(model)

    const hooksDir = join(options.output, 'hooks')
    await ensureDir(hooksDir)

    // Write entity files
    for (const [name, content] of hooks.entities) {
      await writeFile(join(hooksDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(hooksDir, 'keys.ts'), hooks.keys)
    await writeFile(join(hooksDir, 'index.ts'), hooks.index)

    console.log(`Written React hooks to ${hooksDir}/`)
  }

  // 4. Zod schemas (KEEP OLD - works fine)
  if (options.schemas) {
    console.log('\nGenerating Zod schemas...')
    // Use existing parseOpenAPI for zod-generator (until refactored)
    const parsed = await parseOpenAPI(spec)
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
    console.log(
      `Written ${schemas.schemas.size} schemas + ${schemas.entityBarrels.size} entity barrels to ${schemasDir}/`
    )
  }

  // 5. Collections (KEEP OLD for now - not affected by new generators)
  if (options.collections) {
    console.log('\nGenerating TanStack DB collections...')
    const parsed = await parseOpenAPI(spec)
    const collections = generateCollections(parsed)

    const totalCollections = collections.realtimeCollections.size + collections.offlineActions.size
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

      await writeFile(join(collectionsDir, 'index.ts'), collections.index)
      console.log(`Written ${collections.realtimeCollections.size} realtime collections to ${collectionsDir}/`)

      // Generate offline executor and actions if there are offline entities
      if (collections.offlineActions.size > 0) {
        console.log('\nGenerating offline executor and actions...')
        const offlineDir = join(options.output, 'offline')
        await ensureDir(offlineDir)

        // Write offline executor singleton
        if (collections.offlineExecutor) {
          await writeFile(join(offlineDir, 'executor.ts'), collections.offlineExecutor)
          if (options.verbose) {
            console.log(`  Written: ${join(offlineDir, 'executor.ts')}`)
          }
        }

        // Write offline actions for each entity
        for (const [name, content] of collections.offlineActions) {
          const fileName = `${toKebabCase(name)}.actions.ts`
          const filePath = join(offlineDir, fileName)
          await writeFile(filePath, content)
          if (options.verbose) {
            console.log(`  Written: ${filePath}`)
          }
        }

        console.log(`Written offline executor and ${collections.offlineActions.size} action files to ${offlineDir}/`)
      }
    } else {
      console.log('  No local_first: true entities found, skipping collections')
    }
  }

  // 6. Entity wrappers (KEEP OLD for now - not affected by new generators)
  if (options.entities) {
    console.log('\nGenerating runtime config...')
    const parsed = await parseOpenAPI(spec)
    const configResult = generateConfig(parsed)
    await writeFile(join(options.output, 'config.ts'), configResult.config)
    console.log(`Written config to ${options.output}/config.ts`)

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

      // Generate entities-hook.tsx (aggregator for useEntities)
      console.log('\nGenerating entities hook...')
      const entitiesHook = generateEntitiesHook(parsed)
      await writeFile(join(options.output, 'entities-hook.tsx'), entitiesHook.code)
      console.log(`Written entities-hook.tsx to ${options.output}/`)
    } else {
      console.log('  No entities with CRUD operations found')
    }
  }
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

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would generate:')
      if (options.useLegacyGenerators) {
        console.log('[Using legacy generator architecture]')
        console.log(`  - API client in ${options.output}/client/`)
        console.log(`  - React hooks in ${options.output}/hooks/`)
      } else {
        console.log('[Using new generator architecture]')
        console.log(`  - API layer in ${options.output}/api/`)
        console.log(`  - React hooks in ${options.output}/hooks/`)
      }
      if (options.schemas) {
        console.log(`  - Zod schemas in ${options.output}/schemas/`)
      }
      if (options.collections) {
        console.log(`  - TanStack DB collections in ${options.output}/collections/`)
      }
      if (options.entities) {
        console.log(`  - Entity wrappers in ${options.output}/entities/`)
        console.log(`  - Entities hook in ${options.output}/entities-hook.tsx`)
        console.log(`  - Runtime config in ${options.output}/config.ts`)
      }
      return
    }

    // Use new architecture by default, legacy if explicitly requested
    if (!options.useLegacyGenerators) {
      return await generateWithNewArchitecture(spec, options)
    }

    // Old architecture path
    console.log('Parsing specification...')
    const parsed = await parseOpenAPI(spec)
    console.log(
      `Found ${parsed.endpoints.length} endpoints, ${parsed.schemas.length} schemas`
    )

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

      const totalCollections = collections.realtimeCollections.size + collections.offlineActions.size
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

        await writeFile(join(collectionsDir, 'index.ts'), collections.index)
        console.log(`Written ${collections.realtimeCollections.size} realtime collections to ${collectionsDir}/`)

        // Generate offline executor and actions if there are offline entities
        if (collections.offlineActions.size > 0) {
          console.log('\nGenerating offline executor and actions...')
          const offlineDir = join(options.output, 'offline')
          await ensureDir(offlineDir)

          // Write offline executor singleton
          if (collections.offlineExecutor) {
            await writeFile(join(offlineDir, 'executor.ts'), collections.offlineExecutor)
            if (options.verbose) {
              console.log(`  Written: ${join(offlineDir, 'executor.ts')}`)
            }
          }

          // Write offline actions for each entity
          for (const [name, content] of collections.offlineActions) {
            const fileName = `${toKebabCase(name)}.actions.ts`
            const filePath = join(offlineDir, fileName)
            await writeFile(filePath, content)
            if (options.verbose) {
              console.log(`  Written: ${filePath}`)
            }
          }

          console.log(`Written offline executor and ${collections.offlineActions.size} action files to ${offlineDir}/`)
        }
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

        // Generate entities-hook.tsx (aggregator for useEntities)
        console.log('\nGenerating entities hook...')
        const entitiesHook = generateEntitiesHook(parsed)
        await writeFile(join(options.output, 'entities-hook.tsx'), entitiesHook.code)
        console.log(`Written entities-hook.tsx to ${options.output}/`)
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
      rootIndexLines.push('// Aggregated entities hook for entity-agnostic pages')
      rootIndexLines.push("export { useEntities, hasEntity, getEntityNames, type Entities, type EntityApi } from './entities-hook'")
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
