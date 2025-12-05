/**
 * Zod Schema Generator
 *
 * Generates Zod schemas from parsed OpenAPI specifications,
 * providing runtime validation alongside TypeScript types.
 */

import type { ParsedOpenAPI, ParsedSchema } from './parser.js'

export interface GeneratedZodSchemas {
  /** Map of schema name to generated code */
  schemas: Map<string, string>
  /** Entity barrel files (e.g., accounts.ts re-exports Account types) */
  entityBarrels: Map<string, string>
  /** Combined index file */
  index: string
}

export interface ZodGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
  /** Include example values in JSDoc */
  includeExamples?: boolean
  /** Generate Create/Update variants */
  generateVariants?: boolean
  /** Generate validation helpers */
  generateHelpers?: boolean
}

const DEFAULT_OPTIONS: Required<ZodGeneratorOptions> = {
  includeJSDoc: true,
  includeExamples: true,
  generateVariants: true,
  generateHelpers: true,
}

export class ZodSchemaGenerator {
  private options: Required<ZodGeneratorOptions>
  private generatedSchemas = new Set<string>()
  private refMap = new Map<string, string>()

  constructor(options: ZodGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedZodSchemas {
    // Reset state
    this.generatedSchemas.clear()
    this.refMap.clear()

    // Build reference map first
    this.buildRefMap(parsedAPI)

    // Generate schemas
    const schemas = new Map<string, string>()

    for (const schema of parsedAPI.schemas) {
      if (!schema.name || !schema.ref) continue
      if (this.generatedSchemas.has(schema.name)) continue

      const code = this.generateSchemaFile(schema)
      schemas.set(schema.name, code)
      this.generatedSchemas.add(schema.name)
    }

    // Generate entity barrel files
    const entityBarrels = this.generateEntityBarrels(parsedAPI.schemas)

    // Generate index file
    const index = this.generateIndexFile(parsedAPI.schemas)

    return { schemas, entityBarrels, index }
  }

  private buildRefMap(parsedAPI: ParsedOpenAPI) {
    for (const schema of parsedAPI.schemas) {
      if (schema.ref && schema.name) {
        this.refMap.set(schema.ref, schema.name)
      }
    }
  }

  private generateSchemaFile(schema: ParsedSchema): string {
    const lines: string[] = []
    const schemaName = schema.name!
    const zodSchemaName = `${schemaName}Schema`

    // Track referenced schemas for imports
    const referencedSchemas = new Set<string>()

    // File header
    lines.push(this.generateFileHeader(schemaName))
    lines.push('')
    lines.push("import { z } from 'zod'")

    // Generate the schema body first to collect references
    const zodType = this.generateZodType(schema, 0, referencedSchemas)

    // Add imports for referenced schemas
    const sortedRefs = Array.from(referencedSchemas).sort()
    for (const refName of sortedRefs) {
      const fileName = this.toKebabCase(refName)
      lines.push(`import { ${refName}Schema } from './${fileName}.schema'`)
    }

    lines.push('')

    // Main schema
    if (this.options.includeJSDoc && schema.description) {
      lines.push('/**')
      lines.push(` * ${schema.description}`)
      if (this.options.includeExamples && schema.example) {
        lines.push(` * @example ${JSON.stringify(schema.example)}`)
      }
      lines.push(' */')
    }

    lines.push(`export const ${zodSchemaName} = ${zodType}`)
    lines.push('')

    // Inferred TypeScript type
    lines.push(`/** ${schemaName} type inferred from Zod schema */`)
    lines.push(`export type ${schemaName} = z.infer<typeof ${zodSchemaName}>`)
    lines.push('')

    // Generate variants
    if (this.options.generateVariants && schema.type === 'object') {
      lines.push(this.generateVariants(schemaName, zodSchemaName, schema))
    }

    // Generate helpers
    if (this.options.generateHelpers) {
      lines.push(this.generateHelpers(schemaName, zodSchemaName))
    }

    return lines.join('\n')
  }

  private generateZodType(schema: ParsedSchema, indent = 0, referencedSchemas?: Set<string>): string {
    // Handle $ref ONLY if this is a pure reference (no type info)
    // This distinguishes between a reference to another schema vs a schema definition itself
    if (schema.ref && schema.type === 'any' && !schema.properties) {
      const refName = this.refMap.get(schema.ref)
      if (refName) {
        // Track this reference for imports
        if (referencedSchemas) {
          referencedSchemas.add(refName)
        }
        return `${refName}Schema`
      }
      return 'z.unknown()'
    }

    switch (schema.type) {
      case 'string':
        return this.generateStringZod(schema)

      case 'number':
      case 'integer':
        return this.generateNumberZod(schema)

      case 'boolean':
        return this.addNullable('z.boolean()', schema.nullable)

      case 'array':
        if (schema.items) {
          const itemType = this.generateZodType(schema.items, indent, referencedSchemas)
          return this.addNullable(`z.array(${itemType})`, schema.nullable)
        }
        return this.addNullable('z.array(z.unknown())', schema.nullable)

      case 'object':
        return this.generateObjectZod(schema, indent, referencedSchemas)

      case 'null':
        return 'z.null()'

      case 'any':
      default:
        return 'z.unknown()'
    }
  }

  private generateStringZod(schema: ParsedSchema): string {
    // Handle enums
    if (schema.enum && schema.enum.length > 0) {
      const enumValues = schema.enum
        .filter((v): v is string => typeof v === 'string')
        .map((v) => `'${v}'`)
        .join(', ')
      return this.addNullable(`z.enum([${enumValues}])`, schema.nullable)
    }

    // Build string schema with format-specific refinements
    let zodString = 'z.string()'

    switch (schema.format) {
      case 'email':
        zodString = 'z.string().email()'
        break
      case 'uri':
      case 'url':
        zodString = 'z.string().url()'
        break
      case 'uuid':
        zodString = 'z.string().uuid()'
        break
      case 'date':
        zodString = 'z.string().date()'
        break
      case 'date-time':
        zodString = 'z.string().datetime()'
        break
      case 'time':
        zodString = 'z.string().time()'
        break
      case 'ipv4':
        zodString = 'z.string().ip({ version: "v4" })'
        break
      case 'ipv6':
        zodString = 'z.string().ip({ version: "v6" })'
        break
      // Add more format handlers as needed
    }

    return this.addNullable(zodString, schema.nullable)
  }

  private generateNumberZod(schema: ParsedSchema): string {
    const zodNumber = schema.type === 'integer' ? 'z.number().int()' : 'z.number()'
    return this.addNullable(zodNumber, schema.nullable)
  }

  private generateObjectZod(schema: ParsedSchema, indent: number, referencedSchemas?: Set<string>): string {
    if (!schema.properties) {
      return this.addNullable('z.record(z.string(), z.unknown())', schema.nullable)
    }

    const spaces = '  '.repeat(indent)
    const innerSpaces = '  '.repeat(indent + 1)
    const required = schema.required || []

    const properties = Object.entries(schema.properties).map(([propName, propSchema]) => {
      const propType = this.generateZodType(propSchema, indent + 1, referencedSchemas)
      const isRequired = required.includes(propName)

      // Add description as comment if available
      let line = ''
      if (this.options.includeJSDoc && propSchema.description) {
        line += `${innerSpaces}/** ${propSchema.description} */\n`
      }

      line += `${innerSpaces}${this.safePropName(propName)}: ${propType}`

      // Make optional if not required
      if (!isRequired) {
        line += '.optional()'
      }

      return line
    })

    const objectSchema = `z.object({\n${properties.join(',\n')}\n${spaces}})`
    return this.addNullable(objectSchema, schema.nullable)
  }

  private addNullable(zodType: string, nullable?: boolean): string {
    if (nullable) {
      return `${zodType}.nullable()`
    }
    return zodType
  }

  private safePropName(name: string): string {
    // If property name needs quoting
    if (/[^a-zA-Z0-9_]/.test(name) || /^\d/.test(name)) {
      return `'${name}'`
    }
    return name
  }

  private generateVariants(
    schemaName: string,
    zodSchemaName: string,
    schema: ParsedSchema
  ): string {
    const lines: string[] = []

    // Determine which fields are typically auto-generated (should be omitted from Create)
    const autoGeneratedFields = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']
    const omitFromCreate = autoGeneratedFields.filter(
      (field) => schema.properties && field in schema.properties
    )

    // Create schema (omit auto-generated fields)
    lines.push('/**')
    lines.push(` * Schema for creating a new ${schemaName}`)
    lines.push(` * Omits: ${omitFromCreate.join(', ') || 'nothing'}`)
    lines.push(' */')
    if (omitFromCreate.length > 0) {
      lines.push(
        `export const ${schemaName}CreateSchema = ${zodSchemaName}.omit({ ${omitFromCreate.map((f) => `${f}: true`).join(', ')} })`
      )
    } else {
      lines.push(`export const ${schemaName}CreateSchema = ${zodSchemaName}`)
    }
    lines.push(`export type ${schemaName}Create = z.infer<typeof ${schemaName}CreateSchema>`)
    lines.push('')

    // Update schema (all fields optional except id)
    lines.push('/**')
    lines.push(` * Schema for updating an existing ${schemaName}`)
    lines.push(' * All fields optional for partial updates')
    lines.push(' */')
    if (omitFromCreate.length > 0) {
      lines.push(`export const ${schemaName}UpdateSchema = ${schemaName}CreateSchema.partial()`)
    } else {
      lines.push(`export const ${schemaName}UpdateSchema = ${zodSchemaName}.partial()`)
    }
    lines.push(`export type ${schemaName}Update = z.infer<typeof ${schemaName}UpdateSchema>`)
    lines.push('')

    return lines.join('\n')
  }

  private generateHelpers(schemaName: string, zodSchemaName: string): string {
    const lines: string[] = []

    lines.push('// Validation helpers')
    lines.push('')

    // Parse function (throws on invalid)
    lines.push('/**')
    lines.push(` * Parse and validate data as ${schemaName}`)
    lines.push(' * @throws {ZodError} if validation fails')
    lines.push(' */')
    lines.push(`export function parse${schemaName}(data: unknown): ${schemaName} {`)
    lines.push(`  return ${zodSchemaName}.parse(data)`)
    lines.push('}')
    lines.push('')

    // SafeParse function (returns result object)
    lines.push('/**')
    lines.push(` * Safely parse data as ${schemaName}`)
    lines.push(' * @returns Result object with success/error')
    lines.push(' */')
    lines.push(`export function safeParse${schemaName}(data: unknown) {`)
    lines.push(`  return ${zodSchemaName}.safeParse(data)`)
    lines.push('}')
    lines.push('')

    // Type guard
    lines.push('/**')
    lines.push(` * Type guard for ${schemaName}`)
    lines.push(' */')
    lines.push(`export function is${schemaName}(data: unknown): data is ${schemaName} {`)
    lines.push(`  return ${zodSchemaName}.safeParse(data).success`)
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate entity barrel files that group related schemas.
   * E.g., AccountOwner, AccountCreate, AccountUpdate → accounts.ts
   */
  private generateEntityBarrels(schemas: ParsedSchema[]): Map<string, string> {
    const barrels = new Map<string, string>()

    // Group schemas by entity
    const entityGroups = new Map<string, { schemas: string[], primaryType: string | null }>()

    for (const schema of schemas) {
      if (!schema.name) continue

      const entityName = this.extractEntityFromSchemaName(schema.name)
      if (!entityName) continue

      if (!entityGroups.has(entityName)) {
        entityGroups.set(entityName, { schemas: [], primaryType: null })
      }

      const group = entityGroups.get(entityName)!
      group.schemas.push(schema.name)

      // Determine primary type (prefer Owner > Response > base name)
      if (schema.name === this.toPascalCase(entityName) + 'Owner') {
        group.primaryType = schema.name
      } else if (!group.primaryType && schema.name === this.toPascalCase(entityName) + 'Response') {
        group.primaryType = schema.name
      } else if (!group.primaryType && schema.name === this.toPascalCase(entityName)) {
        group.primaryType = schema.name
      }
    }

    // Generate barrel files for entities with multiple schemas
    for (const [entityName, group] of entityGroups) {
      if (group.schemas.length < 2) continue  // Skip single-schema entities

      const lines: string[] = []
      const pluralEntityName = this.pluralize(entityName)
      const pascalSingular = this.toPascalCase(entityName)

      lines.push(this.generateFileHeader(`${pascalSingular} Entity Schemas`))
      lines.push('')

      // Import the primary type first (if we have one)
      if (group.primaryType) {
        const primaryFileName = this.toKebabCase(group.primaryType)
        lines.push(`import type { ${group.primaryType} as _Primary${pascalSingular} } from './${primaryFileName}.schema'`)
        lines.push('')
      }

      lines.push('/**')
      lines.push(` * Barrel file for all ${pascalSingular} related schemas.`)
      lines.push(` * Import from this file for unified ${pascalSingular} types.`)
      lines.push(' */')
      lines.push('')

      // Re-export all schemas
      for (const schemaName of group.schemas.sort()) {
        const fileName = this.toKebabCase(schemaName)
        lines.push(`export * from './${fileName}.schema'`)
      }

      // Add primary type alias if we identified one
      if (group.primaryType) {
        lines.push('')
        lines.push(`/** Primary ${pascalSingular} type for read operations */`)
        lines.push(`export type ${pascalSingular} = _Primary${pascalSingular}`)
      }

      lines.push('')

      barrels.set(pluralEntityName, lines.join('\n'))
    }

    return barrels
  }

  /**
   * Extract entity name from schema name.
   * E.g., "AccountOwner" → "account", "AccountCreate" → "account"
   */
  private extractEntityFromSchemaName(schemaName: string): string | null {
    // Common suffixes to strip
    const suffixes = ['Owner', 'Response', 'Create', 'Update', 'ListResponse', 'FullContext', 'WithTracking']

    for (const suffix of suffixes) {
      if (schemaName.endsWith(suffix)) {
        const baseName = schemaName.slice(0, -suffix.length)
        return baseName.toLowerCase()
      }
    }

    // If no suffix matched, use the full name as-is
    return schemaName.toLowerCase()
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  private pluralize(str: string): string {
    if (str.endsWith('y')) {
      return str.slice(0, -1) + 'ies'
    }
    if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
      return str + 'es'
    }
    return str + 's'
  }

  private generateIndexFile(schemas: ParsedSchema[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Schemas Index'))
    lines.push('')
    lines.push("export { z } from 'zod'")
    lines.push('')

    // Export all schemas
    for (const schema of schemas) {
      if (!schema.name) continue
      const fileName = this.toKebabCase(schema.name)
      lines.push(`export * from './${fileName}.schema'`)
    }

    lines.push('')

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

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }
}

// Factory function for easy usage
export function generateZodSchemas(
  parsedAPI: ParsedOpenAPI,
  options?: ZodGeneratorOptions
): GeneratedZodSchemas {
  const generator = new ZodSchemaGenerator(options)
  return generator.generate(parsedAPI)
}
