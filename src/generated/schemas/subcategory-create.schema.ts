/**
 * SubcategoryCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a subcategory.
 */
export const SubcategoryCreateSchema = z.object({
  /** UUID of the household that owns this subcategory */
  household_id: z.string().uuid(),
  /** UUID of the parent category for this subcategory */
  category_id: z.string().uuid(),
  /** Subcategory name */
  name: z.string(),
  /** URL-safe identifier (auto-generated from name if not provided) */
  slug: z.unknown().optional(),
  /** Subcategory description */
  description: z.unknown().optional(),
  /** Hex color code for UI display (e.g., #FF5733) */
  color: z.unknown().optional(),
  /** Icon identifier for UI display */
  icon: z.unknown().optional(),
  /** Whether the subcategory is active (default: True) */
  is_active: z.boolean().optional(),
  /** Display order for listing (default: 0) */
  sort_order: z.number().int().optional()
})

/** SubcategoryCreate type inferred from Zod schema */
export type SubcategoryCreate = z.infer<typeof SubcategoryCreateSchema>

/**
 * Schema for creating a new SubcategoryCreate
 * Omits: nothing
 */
export const SubcategoryCreateCreateSchema = SubcategoryCreateSchema
export type SubcategoryCreateCreate = z.infer<typeof SubcategoryCreateCreateSchema>

/**
 * Schema for updating an existing SubcategoryCreate
 * All fields optional for partial updates
 */
export const SubcategoryCreateUpdateSchema = SubcategoryCreateSchema.partial()
export type SubcategoryCreateUpdate = z.infer<typeof SubcategoryCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as SubcategoryCreate
 * @throws {ZodError} if validation fails
 */
export function parseSubcategoryCreate(data: unknown): SubcategoryCreate {
  return SubcategoryCreateSchema.parse(data)
}

/**
 * Safely parse data as SubcategoryCreate
 * @returns Result object with success/error
 */
export function safeParseSubcategoryCreate(data: unknown) {
  return SubcategoryCreateSchema.safeParse(data)
}

/**
 * Type guard for SubcategoryCreate
 */
export function isSubcategoryCreate(data: unknown): data is SubcategoryCreate {
  return SubcategoryCreateSchema.safeParse(data).success
}
