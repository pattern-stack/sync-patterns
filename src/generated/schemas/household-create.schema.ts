/**
 * HouseholdCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a household.
 */
export const HouseholdCreateSchema = z.object({
  /** Household display name */
  display_name: z.string(),
  /** Contact email for household */
  email: z.unknown().optional(),
  /** Contact phone for household */
  phone: z.unknown().optional(),
  /** Additional household metadata (description, settings, etc.) */
  profile_data: z.record(z.string(), z.unknown()).optional()
})

/** HouseholdCreate type inferred from Zod schema */
export type HouseholdCreate = z.infer<typeof HouseholdCreateSchema>

/**
 * Schema for creating a new HouseholdCreate
 * Omits: nothing
 */
export const HouseholdCreateCreateSchema = HouseholdCreateSchema
export type HouseholdCreateCreate = z.infer<typeof HouseholdCreateCreateSchema>

/**
 * Schema for updating an existing HouseholdCreate
 * All fields optional for partial updates
 */
export const HouseholdCreateUpdateSchema = HouseholdCreateSchema.partial()
export type HouseholdCreateUpdate = z.infer<typeof HouseholdCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as HouseholdCreate
 * @throws {ZodError} if validation fails
 */
export function parseHouseholdCreate(data: unknown): HouseholdCreate {
  return HouseholdCreateSchema.parse(data)
}

/**
 * Safely parse data as HouseholdCreate
 * @returns Result object with success/error
 */
export function safeParseHouseholdCreate(data: unknown) {
  return HouseholdCreateSchema.safeParse(data)
}

/**
 * Type guard for HouseholdCreate
 */
export function isHouseholdCreate(data: unknown): data is HouseholdCreate {
  return HouseholdCreateSchema.safeParse(data).success
}
