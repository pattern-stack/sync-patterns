/**
 * TransactionUpdate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for updating a transaction.

All fields are optional. Used for editing transaction details,
categorization, and other enrichment operations.
 */
export const TransactionUpdateSchema = z.object({
  description: z.unknown().optional(),
  transaction_date: z.unknown().optional(),
  amount: z.unknown().optional(),
  category_id: z.unknown().optional(),
  subcategory_id: z.unknown().optional(),
  budget_owner_type: z.unknown().optional(),
  budget_owner_user_id: z.unknown().optional(),
  merchant_name: z.unknown().optional(),
  memo: z.unknown().optional()
})

/** TransactionUpdate type inferred from Zod schema */
export type TransactionUpdate = z.infer<typeof TransactionUpdateSchema>

/**
 * Schema for creating a new TransactionUpdate
 * Omits: nothing
 */
export const TransactionUpdateCreateSchema = TransactionUpdateSchema
export type TransactionUpdateCreate = z.infer<typeof TransactionUpdateCreateSchema>

/**
 * Schema for updating an existing TransactionUpdate
 * All fields optional for partial updates
 */
export const TransactionUpdateUpdateSchema = TransactionUpdateSchema.partial()
export type TransactionUpdateUpdate = z.infer<typeof TransactionUpdateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as TransactionUpdate
 * @throws {ZodError} if validation fails
 */
export function parseTransactionUpdate(data: unknown): TransactionUpdate {
  return TransactionUpdateSchema.parse(data)
}

/**
 * Safely parse data as TransactionUpdate
 * @returns Result object with success/error
 */
export function safeParseTransactionUpdate(data: unknown) {
  return TransactionUpdateSchema.safeParse(data)
}

/**
 * Type guard for TransactionUpdate
 */
export function isTransactionUpdate(data: unknown): data is TransactionUpdate {
  return TransactionUpdateSchema.safeParse(data).success
}
