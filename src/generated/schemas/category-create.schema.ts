/**
 * CategoryCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a new category.
 */
export const CategoryCreateSchema = z.object({
  /** UUID of the household that owns this category */
  household_id: z.string().uuid(),
  /** Category name */
  name: z.string(),
  /** URL-safe identifier (auto-generated from name if not provided) */
  slug: z.unknown().optional(),
  /** Optional category description */
  description: z.unknown().optional(),
  /** Hex color code for UI display (#RRGGBB format) */
  color: z.unknown().optional(),
  /** Icon identifier for UI display */
  icon: z.unknown().optional(),
  /** Whether category is active for use */
  is_active: z.boolean().optional(),
  /** Display order for sorting (lower numbers first) */
  sort_order: z.number().int().optional()
})

/** CategoryCreate type inferred from Zod schema */
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>

/**
 * Schema for creating a new CategoryCreate
 * Omits: nothing
 */
export const CategoryCreateCreateSchema = CategoryCreateSchema
export type CategoryCreateCreate = z.infer<typeof CategoryCreateCreateSchema>

/**
 * Schema for updating an existing CategoryCreate
 * All fields optional for partial updates
 */
export const CategoryCreateUpdateSchema = CategoryCreateSchema.partial()
export type CategoryCreateUpdate = z.infer<typeof CategoryCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as CategoryCreate
 * @throws {ZodError} if validation fails
 */
export function parseCategoryCreate(data: unknown): CategoryCreate {
  return CategoryCreateSchema.parse(data)
}

/**
 * Safely parse data as CategoryCreate
 * @returns Result object with success/error
 */
export function safeParseCategoryCreate(data: unknown) {
  return CategoryCreateSchema.safeParse(data)
}

/**
 * Type guard for CategoryCreate
 */
export function isCategoryCreate(data: unknown): data is CategoryCreate {
  return CategoryCreateSchema.safeParse(data).success
}
