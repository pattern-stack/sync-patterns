/**
 * HTTPValidationError
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'
import { ValidationErrorSchema } from './validation-error.schema'

export const HTTPValidationErrorSchema = z.object({
  detail: z.array(ValidationErrorSchema).optional()
})

/** HTTPValidationError type inferred from Zod schema */
export type HTTPValidationError = z.infer<typeof HTTPValidationErrorSchema>

/**
 * Schema for creating a new HTTPValidationError
 * Omits: nothing
 */
export const HTTPValidationErrorCreateSchema = HTTPValidationErrorSchema
export type HTTPValidationErrorCreate = z.infer<typeof HTTPValidationErrorCreateSchema>

/**
 * Schema for updating an existing HTTPValidationError
 * All fields optional for partial updates
 */
export const HTTPValidationErrorUpdateSchema = HTTPValidationErrorSchema.partial()
export type HTTPValidationErrorUpdate = z.infer<typeof HTTPValidationErrorUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as HTTPValidationError
 * @throws {ZodError} if validation fails
 */
export function parseHTTPValidationError(data: unknown): HTTPValidationError {
  return HTTPValidationErrorSchema.parse(data)
}

/**
 * Safely parse data as HTTPValidationError
 * @returns Result object with success/error
 */
export function safeParseHTTPValidationError(data: unknown) {
  return HTTPValidationErrorSchema.safeParse(data)
}

/**
 * Type guard for HTTPValidationError
 */
export function isHTTPValidationError(data: unknown): data is HTTPValidationError {
  return HTTPValidationErrorSchema.safeParse(data).success
}
