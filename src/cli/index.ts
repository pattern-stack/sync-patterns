/**
 * sync-patterns CLI
 *
 * Generate typed clients from OpenAPI specs with runtime validation
 */

import { Command } from 'commander'
import { generateCommand } from './commands/generate.js'
import { schemaCheckCommand } from './commands/schema-check.js'

const program = new Command()

program
  .name('sync-patterns')
  .description('Generate typed clients from OpenAPI specs with Zod validation')
  .version('0.1.0')

// Generate command
// Defaults can be set via environment variables (SYNC_PATTERNS_*)
program
  .command('generate')
  .description('Generate typed clients from OpenAPI specification')
  .argument('<source>', 'OpenAPI specification (URL or file path)')
  .option('-o, --output <dir>', 'Output directory', './src/generated')
  .option('--schemas [boolean]', 'Generate Zod schemas', true)
  .option('--no-schemas', 'Skip Zod schema generation')
  .option('--client [boolean]', 'Generate API client', true)
  .option('--no-client', 'Skip API client generation')
  .option('--hooks [boolean]', 'Generate React Query hooks', true)
  .option('--no-hooks', 'Skip React Query hook generation')
  .option('--collections [boolean]', 'Generate TanStack DB collections (for local_first: true)', true)
  .option('--no-collections', 'Skip TanStack DB collection generation')
  .option('--entities [boolean]', 'Generate unified entity wrappers (THE public API)', true)
  .option('--no-entities', 'Skip entity wrapper generation')
  .option(
    '--api-url <url>',
    'Default API base URL for generated client',
    process.env.SYNC_PATTERNS_API_URL
  )
  .option(
    '--api-url-env <var>',
    'Environment variable name for API URL',
    process.env.SYNC_PATTERNS_API_URL_ENV || 'VITE_API_URL'
  )
  .option(
    '--timeout <ms>',
    'Default request timeout in milliseconds',
    process.env.SYNC_PATTERNS_TIMEOUT || '10000'
  )
  .option(
    '--auth-token-key <key>',
    'localStorage key for auth token',
    process.env.SYNC_PATTERNS_AUTH_TOKEN_KEY || 'auth_token'
  )
  .option('--dry-run', 'Preview without writing files')
  .option('--verbose', 'Show detailed output')
  .action(generateCommand)

// Schema check command
program
  .command('schema:check')
  .description('Check for schema drift in offline mode entities')
  .requiredOption('-i, --input <file>', 'OpenAPI specification file (required)')
  .option('--fix', 'Update stored schema hashes')
  .option('--strict', 'Exit with error code if drift detected (for CI)')
  .option('--verbose', 'Show detailed output')
  .option('--hash-file <file>', 'Custom hash file location')
  .action(schemaCheckCommand)

// Help command
program
  .command('help')
  .description('Display help')
  .action(() => {
    console.log(`
sync-patterns CLI

Generate typed clients from OpenAPI specs with Zod runtime validation.

Commands:
  generate <source>      Generate code from OpenAPI spec
  schema:check           Check for schema drift in offline mode entities
  help                   Show this help message

Examples:
  sync-patterns generate ./openapi.json
  sync-patterns generate ./openapi.json --output ./src/api
  sync-patterns generate https://api.example.com/openapi.json --dry-run
  sync-patterns schema:check --input ./openapi.json
  sync-patterns schema:check --input ./openapi.json --fix

For more information:
  sync-patterns generate --help
  sync-patterns schema:check --help
`)
  })

// Parse arguments
if (process.argv.length < 3) {
  program.help()
} else {
  program.parse()
}

export default program
