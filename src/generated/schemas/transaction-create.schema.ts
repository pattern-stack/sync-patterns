/**
 * TransactionCreate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for creating a new transaction.

Used for both manual entry and import scenarios.
 */
export const TransactionCreateSchema = z.object({
  /** Household UUID */
  household_id: z.string().uuid(),
  /** Financial account UUID */
  account_id: z.string().uuid(),
  /** Transaction amount (+ inflow, - outflow) */
  amount: z.unknown(),
  description: z.string(),
  /** Transaction date */
  transaction_date: z.string().date(),
  /** Category UUID */
  category_id: z.unknown().optional(),
  /** Subcategory UUID */
  subcategory_id: z.unknown().optional(),
  /** Budget owner type (personal|shared) */
  budget_owner_type: z.string().optional(),
  /** If PERSONAL, which user's budget */
  budget_owner_user_id: z.unknown().optional(),
  /** External system ID for deduplication */
  external_id: z.unknown().optional(),
  /** External reference number */
  external_ref: z.unknown().optional(),
  /** Merchant name */
  merchant_name: z.unknown().optional(),
  /** Transaction memo */
  memo: z.unknown().optional(),
  /** Import source (OFX, CSV, etc.) */
  import_source: z.unknown().optional(),
  /** When transaction was imported */
  imported_at: z.unknown().optional(),
  /** Sync job that imported this transaction */
  sync_job_id: z.unknown().optional()
})

/** TransactionCreate type inferred from Zod schema */
export type TransactionCreate = z.infer<typeof TransactionCreateSchema>

/**
 * Schema for creating a new TransactionCreate
 * Omits: nothing
 */
export const TransactionCreateCreateSchema = TransactionCreateSchema
export type TransactionCreateCreate = z.infer<typeof TransactionCreateCreateSchema>

/**
 * Schema for updating an existing TransactionCreate
 * All fields optional for partial updates
 */
export const TransactionCreateUpdateSchema = TransactionCreateSchema.partial()
export type TransactionCreateUpdate = z.infer<typeof TransactionCreateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as TransactionCreate
 * @throws {ZodError} if validation fails
 */
export function parseTransactionCreate(data: unknown): TransactionCreate {
  return TransactionCreateSchema.parse(data)
}

/**
 * Safely parse data as TransactionCreate
 * @returns Result object with success/error
 */
export function safeParseTransactionCreate(data: unknown) {
  return TransactionCreateSchema.safeParse(data)
}

/**
 * Type guard for TransactionCreate
 */
export function isTransactionCreate(data: unknown): data is TransactionCreate {
  return TransactionCreateSchema.safeParse(data).success
}
