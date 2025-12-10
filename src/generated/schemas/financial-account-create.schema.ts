/**
 * FinancialAccountCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a new financial account.
 */
export const FinancialAccountCreateSchema = z.object({
  /** UUID of the household that owns this account */
  household_id: z.string().uuid(),
  /** UUID of the user who owns this account */
  owner_user_id: z.string().uuid(),
  /** Display name for the account */
  name: z.string(),
  /** Type of account (checking, savings, credit_card, cash) */
  account_type: z.enum(['checking', 'savings', 'credit_card', 'cash']),
  /** Visibility scope: household (visible to all) or owner_only */
  visibility_scope: z.enum(['household', 'owner_only']).optional(),
  /** External ID from bank connection service */
  external_id: z.unknown().optional(),
  /** Name of the financial institution */
  institution_name: z.unknown().optional(),
  /** Institution ID from bank connection service */
  institution_id: z.unknown().optional(),
  /** Currency code (ISO 4217) */
  currency: z.string().optional(),
  /** Last known account balance from external sync */
  last_known_balance: z.unknown().optional(),
  /** Timestamp of last known balance */
  balance_as_of: z.unknown().optional()
})

/** FinancialAccountCreate type inferred from Zod schema */
export type FinancialAccountCreate = z.infer<typeof FinancialAccountCreateSchema>

/**
 * Schema for creating a new FinancialAccountCreate
 * Omits: nothing
 */
export const FinancialAccountCreateCreateSchema = FinancialAccountCreateSchema
export type FinancialAccountCreateCreate = z.infer<typeof FinancialAccountCreateCreateSchema>

/**
 * Schema for updating an existing FinancialAccountCreate
 * All fields optional for partial updates
 */
export const FinancialAccountCreateUpdateSchema = FinancialAccountCreateSchema.partial()
export type FinancialAccountCreateUpdate = z.infer<typeof FinancialAccountCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as FinancialAccountCreate
 * @throws {ZodError} if validation fails
 */
export function parseFinancialAccountCreate(data: unknown): FinancialAccountCreate {
  return FinancialAccountCreateSchema.parse(data)
}

/**
 * Safely parse data as FinancialAccountCreate
 * @returns Result object with success/error
 */
export function safeParseFinancialAccountCreate(data: unknown) {
  return FinancialAccountCreateSchema.safeParse(data)
}

/**
 * Type guard for FinancialAccountCreate
 */
export function isFinancialAccountCreate(data: unknown): data is FinancialAccountCreate {
  return FinancialAccountCreateSchema.safeParse(data).success
}
