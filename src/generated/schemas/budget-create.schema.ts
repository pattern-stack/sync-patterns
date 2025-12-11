/**
 * BudgetCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a new budget.
 */
export const BudgetCreateSchema = z.object({
  /** UUID of the household that owns this budget */
  household_id: z.string().uuid(),
  /** Category this budget targets (optional) */
  category_id: z.unknown().optional(),
  /** Subcategory this budget targets (optional) */
  subcategory_id: z.unknown().optional(),
  /** Budget ownership type: 'personal' or 'shared' */
  budget_type: z.string(),
  /** User ID if budget_type is 'personal' (required for personal budgets) */
  user_id: z.unknown().optional(),
  /** Monthly target amount */
  amount_target: z.unknown(),
  /** First day of the budget month (e.g., 2024-01-01) */
  month: z.string().date()
})

/** BudgetCreate type inferred from Zod schema */
export type BudgetCreate = z.infer<typeof BudgetCreateSchema>

/**
 * Schema for creating a new BudgetCreate
 * Omits: nothing
 */
export const BudgetCreateCreateSchema = BudgetCreateSchema
export type BudgetCreateCreate = z.infer<typeof BudgetCreateCreateSchema>

/**
 * Schema for updating an existing BudgetCreate
 * All fields optional for partial updates
 */
export const BudgetCreateUpdateSchema = BudgetCreateSchema.partial()
export type BudgetCreateUpdate = z.infer<typeof BudgetCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as BudgetCreate
 * @throws {ZodError} if validation fails
 */
export function parseBudgetCreate(data: unknown): BudgetCreate {
  return BudgetCreateSchema.parse(data)
}

/**
 * Safely parse data as BudgetCreate
 * @returns Result object with success/error
 */
export function safeParseBudgetCreate(data: unknown) {
  return BudgetCreateSchema.safeParse(data)
}

/**
 * Type guard for BudgetCreate
 */
export function isBudgetCreate(data: unknown): data is BudgetCreate {
  return BudgetCreateSchema.safeParse(data).success
}
