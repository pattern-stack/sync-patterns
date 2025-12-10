/**
 * BudgetUpdate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for updating an existing budget.

Note: household_id, category_id, subcategory_id, and month cannot be changed.
These are considered immutable after creation. To change these, delete and recreate.
 */
export const BudgetUpdateSchema = z.object({
  /** Updated budget type */
  budget_type: z.unknown().optional(),
  /** Updated user ID (for personal budgets) */
  user_id: z.unknown().optional(),
  /** Updated monthly target amount */
  amount_target: z.unknown().optional()
})

/** BudgetUpdate type inferred from Zod schema */
export type BudgetUpdate = z.infer<typeof BudgetUpdateSchema>

/**
 * Schema for creating a new BudgetUpdate
 * Omits: nothing
 */
export const BudgetUpdateCreateSchema = BudgetUpdateSchema
export type BudgetUpdateCreate = z.infer<typeof BudgetUpdateCreateSchema>

/**
 * Schema for updating an existing BudgetUpdate
 * All fields optional for partial updates
 */
export const BudgetUpdateUpdateSchema = BudgetUpdateSchema.partial()
export type BudgetUpdateUpdate = z.infer<typeof BudgetUpdateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as BudgetUpdate
 * @throws {ZodError} if validation fails
 */
export function parseBudgetUpdate(data: unknown): BudgetUpdate {
  return BudgetUpdateSchema.parse(data)
}

/**
 * Safely parse data as BudgetUpdate
 * @returns Result object with success/error
 */
export function safeParseBudgetUpdate(data: unknown) {
  return BudgetUpdateSchema.safeParse(data)
}

/**
 * Type guard for BudgetUpdate
 */
export function isBudgetUpdate(data: unknown): data is BudgetUpdate {
  return BudgetUpdateSchema.safeParse(data).success
}
