/**
 * FinancialAccountUpdate
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { z } from 'zod'

/**
 * Schema for updating an existing financial account.
 */
export const FinancialAccountUpdateSchema = z.object({
  /** Updated display name for the account */
  name: z.unknown().optional(),
  /** Updated account type */
  account_type: z.unknown().optional(),
  /** Updated visibility scope */
  visibility_scope: z.unknown().optional(),
  /** Updated owner user ID */
  owner_user_id: z.unknown().optional(),
  /** Updated external ID */
  external_id: z.unknown().optional(),
  /** Updated institution name */
  institution_name: z.unknown().optional(),
  /** Updated institution ID */
  institution_id: z.unknown().optional(),
  /** Updated currency code */
  currency: z.unknown().optional(),
  /** Updated last known balance */
  last_known_balance: z.unknown().optional(),
  /** Updated balance timestamp */
  balance_as_of: z.unknown().optional()
})

/** FinancialAccountUpdate type inferred from Zod schema */
export type FinancialAccountUpdate = z.infer<typeof FinancialAccountUpdateSchema>

/**
 * Schema for creating a new FinancialAccountUpdate
 * Omits: nothing
 */
export const FinancialAccountUpdateCreateSchema = FinancialAccountUpdateSchema
export type FinancialAccountUpdateCreate = z.infer<typeof FinancialAccountUpdateCreateSchema>

/**
 * Schema for updating an existing FinancialAccountUpdate
 * All fields optional for partial updates
 */
export const FinancialAccountUpdateUpdateSchema = FinancialAccountUpdateSchema.partial()
export type FinancialAccountUpdateUpdate = z.infer<typeof FinancialAccountUpdateUpdateSchema>

// Validation helpers

/**
 * Parse and validate data as FinancialAccountUpdate
 * @throws {ZodError} if validation fails
 */
export function parseFinancialAccountUpdate(data: unknown): FinancialAccountUpdate {
  return FinancialAccountUpdateSchema.parse(data)
}

/**
 * Safely parse data as FinancialAccountUpdate
 * @returns Result object with success/error
 */
export function safeParseFinancialAccountUpdate(data: unknown) {
  return FinancialAccountUpdateSchema.safeParse(data)
}

/**
 * Type guard for FinancialAccountUpdate
 */
export function isFinancialAccountUpdate(data: unknown): data is FinancialAccountUpdate {
  return FinancialAccountUpdateSchema.safeParse(data).success
}
