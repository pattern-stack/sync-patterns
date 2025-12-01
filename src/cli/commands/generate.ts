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

export interface GenerateOptions {
  output: string
  schemas: boolean
  client: boolean
  hooks: boolean
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

      // Write index file
      await writeFile(join(schemasDir, 'index.ts'), schemas.index)
      console.log(`Written ${schemas.schemas.size} schemas to ${schemasDir}/`)

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

    // Generate root index and types re-export
    console.log('\nGenerating root index...')

    const rootIndex = `/**
 * Generated API Client & Types
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

// Re-export all schemas/types
export * from './schemas/index.js'

// Re-export API client
export * from './client/index.js'

// Re-export React hooks
export * from './hooks/index.js'
`
    await writeFile(join(options.output, 'index.ts'), rootIndex)

    // Generate a types.ts alias for backward compatibility
    const typesAlias = `/**
 * Type Re-exports
 *
 * Convenience re-export of all schema types
 */

export * from './schemas/index.js'
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
