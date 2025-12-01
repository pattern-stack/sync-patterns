/**
 * sync-patterns CLI
 *
 * Generate typed clients from OpenAPI specs with runtime validation
 */

import { Command } from 'commander'
import { generateCommand } from './commands/generate.js'

const program = new Command()

program
  .name('sync-patterns')
  .description('Generate typed clients from OpenAPI specs with Zod validation')
  .version('0.1.0')

// Generate command
program
  .command('generate')
  .description('Generate typed clients from OpenAPI specification')
  .argument('<source>', 'OpenAPI specification (URL or file path)')
  .option('-o, --output <dir>', 'Output directory', './src/generated')
  .option('--schemas', 'Generate Zod schemas (default: true)', true)
  .option('--client', 'Generate API client (default: true)', true)
  .option('--hooks', 'Generate React Query hooks (default: true)', true)
  .option('--dry-run', 'Preview without writing files')
  .option('--verbose', 'Show detailed output')
  .action(generateCommand)

// Help command
program
  .command('help')
  .description('Display help')
  .action(() => {
    console.log(`
sync-patterns CLI

Generate typed clients from OpenAPI specs with Zod runtime validation.

Commands:
  generate <source>    Generate code from OpenAPI spec
  help                 Show this help message

Examples:
  sync-patterns generate ./openapi.json
  sync-patterns generate ./openapi.json --output ./src/api
  sync-patterns generate https://api.example.com/openapi.json --dry-run

For more information:
  sync-patterns generate --help
`)
  })

// Parse arguments
if (process.argv.length < 3) {
  program.help()
} else {
  program.parse()
}

export default program
