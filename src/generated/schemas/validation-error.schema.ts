/**
 * ValidationError
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

export const ValidationErrorSchema = z.object({
  loc: z.array(z.unknown()),
  msg: z.string(),
  type: z.string()
})

/** ValidationError type inferred from Zod schema */
export type ValidationError = z.infer<typeof ValidationErrorSchema>

/**
 * Schema for creating a new ValidationError
 * Omits: nothing
 */
export const ValidationErrorCreateSchema = ValidationErrorSchema
export type ValidationErrorCreate = z.infer<typeof ValidationErrorCreateSchema>

/**
 * Schema for updating an existing ValidationError
 * All fields optional for partial updates
 */
export const ValidationErrorUpdateSchema = ValidationErrorSchema.partial()
export type ValidationErrorUpdate = z.infer<typeof ValidationErrorUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as ValidationError
 * @throws {ZodError} if validation fails
 */
export function parseValidationError(data: unknown): ValidationError {
  return ValidationErrorSchema.parse(data)
}

/**
 * Safely parse data as ValidationError
 * @returns Result object with success/error
 */
export function safeParseValidationError(data: unknown) {
  return ValidationErrorSchema.safeParse(data)
}

/**
 * Type guard for ValidationError
 */
export function isValidationError(data: unknown): data is ValidationError {
  return ValidationErrorSchema.safeParse(data).success
}
