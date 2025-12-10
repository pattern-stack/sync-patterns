/**
 * Query Hooks
 *
 * Auto-generated React hooks from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { useQuery, useInfiniteQuery, type UseQueryOptions, type UseInfiniteQueryOptions } from '@tanstack/react-query'
import { apiClient } from '../client/index'
import { queryKeys } from './keys'

/**
 * List My Households
 * List all households the current user is a member of.
 * @param params Request parameters
 */
export function useListMyHouseholdsApiHouseholdsGet(params: { database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listMyHouseholdsApiHouseholdsGet(params),
    queryFn: () => apiClient.listMyHouseholdsApiHouseholdsGet(params),
    ...options
  })
}

/**
 * Infinite query version of useListMyHouseholdsApiHouseholdsGet
 * @deprecated Consider using regular pagination with useQuery instead
 */
export function useInfiniteListMyHouseholdsApiHouseholdsGet(params: { database_url?: any }, options?: Omit<UseInfiniteQueryOptions<unknown, Error, unknown, readonly unknown[], number>, 'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'>) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.listMyHouseholdsApiHouseholdsGet(params), 'infinite'] as const,
    queryFn: ({ pageParam }) => apiClient.listMyHouseholdsApiHouseholdsGet({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // Default pagination: check for items array and compare to limit
      const page = lastPage as { items?: unknown[]; total?: number } | null
      const hasMore = page?.items && page.items.length > 0 && (page.total === undefined || page.items.length >= (params as { limit?: number }).limit!)
      return hasMore ? lastPageParam + 1 : undefined
    },
    ...options
  })
}

/**
 * Get Household
 * Get household details with member list.

Requires: Must be a household member.
 * @param params Request parameters
 */
export function useGetHouseholdApiHouseholdsHouseholdIdGet(params: { household_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.householdApiHouseholdsHouseholdIdGet(params),
    queryFn: () => apiClient.getHouseholdApiHouseholdsHouseholdIdGet(params.household_id, params),
    ...options
  })
}

/**
 * List Members
 * List household members.

Requires: Must be a household member.
 * @param params Request parameters
 */
export function useListMembersApiHouseholdsHouseholdIdMembersGet(params: { household_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listMembersApiHouseholdsHouseholdIdMembersGet(params),
    queryFn: () => apiClient.listMembersApiHouseholdsHouseholdIdMembersGet(params.household_id, params),
    ...options
  })
}

/**
 * List Accounts
 * List accounts visible to current user.

Requires: Must be a household member.
Returns only accounts the current user has visibility to.
 * @param params Request parameters
 */
export function useListAccountsApiHouseholdsHouseholdIdAccountsGet(params: { household_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listAccountsApiHouseholdsHouseholdIdAccountsGet(params),
    queryFn: () => apiClient.listAccountsApiHouseholdsHouseholdIdAccountsGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Account
 * Get account details.

Requires: Must be member and have account visibility.
 * @param params Request parameters
 */
export function useGetAccountApiHouseholdsHouseholdIdAccountsAccountIdGet(params: { household_id: string; account_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.accountApiHouseholdsHouseholdIdAccountsAccountIdGet(params),
    queryFn: () => apiClient.getAccountApiHouseholdsHouseholdIdAccountsAccountIdGet(params.household_id, params.account_id, params),
    ...options
  })
}

/**
 * List Categories
 * List household categories.

Requires: Must be a household member.
 * @param params Request parameters
 */
export function useListCategoriesApiHouseholdsHouseholdIdCategoriesGet(params: { household_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listCategoriesApiHouseholdsHouseholdIdCategoriesGet(params),
    queryFn: () => apiClient.listCategoriesApiHouseholdsHouseholdIdCategoriesGet(params.household_id, params),
    ...options
  })
}

/**
 * List Subcategories
 * List household subcategories.

Requires: Must be a household member.

Args:
    household_id: Household to query
    category_id: Optional filter to specific category
 * @param params Request parameters
 */
export function useListSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet(params: { household_id: string; category_id?: any; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet(params),
    queryFn: () => apiClient.listSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet(params.household_id, params),
    ...options
  })
}

/**
 * List Transactions
 * List transactions visible to current user.

Requires: Must be a household member.
Returns only transactions on accounts the user has visibility to.

Args:
    household_id: Filter to this household
    account_id: Optional filter to specific account
    state: Optional filter by state (draft, final, settled, voided)
    limit: Max results (1-100, default 50)
    offset: Pagination offset
 * @param params Request parameters
 */
export function useListTransactionsApiHouseholdsHouseholdIdTransactionsGet(params: { household_id: string; account_id?: any; state?: any; limit?: number; offset?: number; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listTransactionsApiHouseholdsHouseholdIdTransactionsGet(params),
    queryFn: () => apiClient.listTransactionsApiHouseholdsHouseholdIdTransactionsGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Transaction
 * Get transaction details.

Requires: Must have visibility to transaction's account.
 * @param params Request parameters
 */
export function useGetTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet(params: { household_id: string; transaction_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet(params),
    queryFn: () => apiClient.getTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet(params.household_id, params.transaction_id, params),
    ...options
  })
}

/**
 * Get Settlement Summary
 * Get settlement summary for a user.

Requires: Must be a household member.

Args:
    household_id: The household
    user_id: User to get summary for (defaults to current user)
 * @param params Request parameters
 */
export function useGetSettlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet(params: { household_id: string; user_id?: any; transaction_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.settlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet(params),
    queryFn: () => apiClient.getSettlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Unsettled Transactions
 * Get unsettled transactions for settlement view.

Requires: Must be a household member.

Args:
    household_id: The household
    owed_by_user_id: Optional filter to debtor
    owed_to_user_id: Optional filter to creditor
 * @param params Request parameters
 */
export function useGetUnsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet(params: { household_id: string; owed_by_user_id?: any; owed_to_user_id?: any; transaction_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.unsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet(params),
    queryFn: () => apiClient.getUnsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet(params.household_id, params),
    ...options
  })
}

/**
 * List Budgets
 * List budgets with progress for a month.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to get budgets for (YYYY-MM-DD format)
    budget_type: Optional filter by type (personal, shared)
    user_id: Optional filter by user (for personal budgets)
 * @param params Request parameters
 */
export function useListBudgetsApiHouseholdsHouseholdIdBudgetsGet(params: { household_id: string; month: string; budget_type?: any; user_id?: any; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.listBudgetsApiHouseholdsHouseholdIdBudgetsGet(params),
    queryFn: () => apiClient.listBudgetsApiHouseholdsHouseholdIdBudgetsGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Budget
 * Get budget with current progress.

Requires: Must be a household member.
 * @param params Request parameters
 */
export function useGetBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet(params: { household_id: string; budget_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.budgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet(params),
    queryFn: () => apiClient.getBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet(params.household_id, params.budget_id, params),
    ...options
  })
}

/**
 * Get My Budget Summary
 * Get budget summary for current user.

Returns personal and shared budget overview with totals.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to get summary for (YYYY-MM-DD format)
 * @param params Request parameters
 */
export function useGetMyBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet(params: { household_id: string; month: string; budget_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.myBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet(params),
    queryFn: () => apiClient.getMyBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Warning Budgets
 * Get budgets approaching limit (80%+ spent).

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to check (YYYY-MM-DD format)
 * @param params Request parameters
 */
export function useGetWarningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet(params: { household_id: string; month: string; budget_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.warningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet(params),
    queryFn: () => apiClient.getWarningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Over Budget
 * Get budgets that are over limit.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to check (YYYY-MM-DD format)
 * @param params Request parameters
 */
export function useGetOverBudgetApiHouseholdsHouseholdIdBudgetsOverGet(params: { household_id: string; month: string; budget_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.overBudgetApiHouseholdsHouseholdIdBudgetsOverGet(params),
    queryFn: () => apiClient.getOverBudgetApiHouseholdsHouseholdIdBudgetsOverGet(params.household_id, params),
    ...options
  })
}

/**
 * Get Category Spending
 * Get spending by category for a month.

Returns spending regardless of whether budgets exist for categories.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to analyze (YYYY-MM-DD format)
    budget_type: Type to filter (personal, shared - default shared)
 * @param params Request parameters
 */
export function useGetCategorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet(params: { household_id: string; month: string; budget_type?: string; budget_id: string; database_url?: any }, options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.categorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet(params),
    queryFn: () => apiClient.getCategorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet(params.household_id, params),
    ...options
  })
}

/**
 * Health Check
 * Health check endpoint.
 * @param options Query options
 */
export function useHealthCheck(options?: UseQueryOptions<unknown, unknown, unknown>) {
  return useQuery({
    queryKey: queryKeys.healthCheck(),
    queryFn: () => apiClient.healthCheck(),
    ...options
  })
}
