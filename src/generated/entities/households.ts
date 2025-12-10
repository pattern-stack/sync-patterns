/**
 * Household
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

/**
 * Household Entity Module
 *
 * Colocates all schemas, hooks, and unified wrappers for this entity.
 * Import from here for a complete, self-contained API for this entity.
 *
 * @example
 * import { HouseholdCreate, useCreateHousehold, useHouseholds } from './entities/households'
 */

// ============================================================================
// SCHEMAS - All types related to this entity
// ============================================================================

export type {
  BudgetCreate,
  BudgetUpdate,
  CategoryCreate,
  FinancialAccountCreate,
  FinancialAccountUpdate,
  HouseholdCreate,
  SubcategoryCreate,
  TransactionCreate,
  TransactionUpdate,
} from '../schemas/index'

export {
  BudgetCreateSchema,
  BudgetUpdateSchema,
  CategoryCreateSchema,
  FinancialAccountCreateSchema,
  FinancialAccountUpdateSchema,
  HouseholdCreateSchema,
  SubcategoryCreateSchema,
  TransactionCreateSchema,
  TransactionUpdateSchema,
} from '../schemas/index'

// ============================================================================
// HOOKS - Additional TanStack Query hooks for this entity
// (CRUD hooks are replaced by unified wrappers below)
// ============================================================================

export {
  useCreateAccountApiHouseholdsHouseholdIdAccountsPost,
  useCreateBudgetApiHouseholdsHouseholdIdBudgetsPost,
  useCreateCategoryApiHouseholdsHouseholdIdCategoriesPost,
  useCreateSubcategoryApiHouseholdsHouseholdIdSubcategoriesPost,
  useCreateTransactionApiHouseholdsHouseholdIdTransactionsPost,
  useDeleteBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdDelete,
  useFinalizeTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdFinalizePost,
  useGetAccountApiHouseholdsHouseholdIdAccountsAccountIdGet,
  useGetBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet,
  useGetCategorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet,
  useGetMyBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet,
  useGetOverBudgetApiHouseholdsHouseholdIdBudgetsOverGet,
  useGetSettlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet,
  useGetTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet,
  useGetUnsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet,
  useGetWarningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet,
  useInviteMemberApiHouseholdsHouseholdIdInvitePost,
  useListAccountsApiHouseholdsHouseholdIdAccountsGet,
  useListBudgetsApiHouseholdsHouseholdIdBudgetsGet,
  useListCategoriesApiHouseholdsHouseholdIdCategoriesGet,
  useListMembersApiHouseholdsHouseholdIdMembersGet,
  useListMyHouseholdsApiHouseholdsGet,
  useListSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet,
  useListTransactionsApiHouseholdsHouseholdIdTransactionsGet,
  useReassignBudgetApiHouseholdsHouseholdIdTransactionsTransactionIdReassignPost,
  useRecordSettlementPaymentApiHouseholdsHouseholdIdSettlementsPost,
  useUpdateAccountApiHouseholdsHouseholdIdAccountsAccountIdPatch,
  useUpdateBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdPatch,
  useUpdateTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdPatch,
  useVoidTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdVoidPost,
} from '../hooks/index'

import * as hooks from '../hooks/index'
import type { Household, HouseholdCreate } from '../schemas/index'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiClient } from '../client'
import type { ColumnMetadata, ColumnMetadataResponse } from '@pattern-stack/frontend-patterns'
import type { UnifiedQueryResult, UnifiedMutationResult, UnifiedQueryResultWithMeta } from './types'

// ============================================================================
// UNIFIED WRAPPERS - Abstract TanStack DB vs Query vs Offline Executor
// ============================================================================

/**
 * Fetch column metadata for households.
 * Uses 30-minute staleTime since metadata rarely changes.
 * Internal hook - used by use{Entity}WithMeta().
 */
function useHouseholdsMetadata(view: 'list' | 'detail' | 'form' = 'list') {
  const metadataQuery = useQuery({
    queryKey: ['households', 'metadata', view],
    queryFn: () => apiClient.get<ColumnMetadataResponse>(
      `/api/v1/households/fields/metadata?view=${view}`
    ),
    staleTime: 30 * 60 * 1000,  // 30 min - metadata is schema-driven, rarely changes
  })

  return {
    columns: metadataQuery.data?.columns ?? [],
    isLoading: metadataQuery.isLoading,
    error: metadataQuery.error ?? null,
  }
}

/**
 * Fetch a single household by ID.
 * Unified wrapper - uses TanStack Query.
 */
export function useHousehold(id: string): UnifiedQueryResult<Household | undefined> {
  // api mode - use TanStack Query
  const result = hooks.useGetHouseholdApiHouseholdsHouseholdIdGet({ household_id: id })
  return {
    data: result.data as Household | undefined,
    isLoading: result.isLoading,
    error: (result.error as Error) ?? null,
  }
}

/**
 * Create a new household.
 * Unified wrapper - uses TanStack Query.
 */
export function useCreateHousehold(): UnifiedMutationResult<Household, HouseholdCreate> {
  // api mode
  const mutation = hooks.useCreateHouseholdApiHouseholdsPost()
  return {
    mutate: (data: HouseholdCreate) => mutation.mutate(data as Record<string, unknown>),
    mutateAsync: async (data: HouseholdCreate) => mutation.mutateAsync(data as Record<string, unknown>) as Promise<Household>,
    isPending: mutation.isPending,
    error: (mutation.error as Error) ?? null,
  }
}
