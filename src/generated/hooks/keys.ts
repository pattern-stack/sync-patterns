/**
 * Query Keys
 *
 * Auto-generated React hooks from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

/**
 * Centralized query key factory
 * Ensures consistent cache key generation across the application
 */

export const queryKeys = {
  all: ['api'] as const,

  // households keys
  households: () => [...queryKeys.all, 'households'] as const,
  listMyHouseholdsApiHouseholdsGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'listMyHouseholdsApiHouseholdsGet', params] as const,
  householdApiHouseholdsHouseholdIdGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'householdApiHouseholdsHouseholdIdGet', params] as const,
  listMembersApiHouseholdsHouseholdIdMembersGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'listMembersApiHouseholdsHouseholdIdMembersGet', params] as const,
  listAccountsApiHouseholdsHouseholdIdAccountsGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'listAccountsApiHouseholdsHouseholdIdAccountsGet', params] as const,
  accountApiHouseholdsHouseholdIdAccountsAccountIdGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'accountApiHouseholdsHouseholdIdAccountsAccountIdGet', params] as const,
  listCategoriesApiHouseholdsHouseholdIdCategoriesGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'listCategoriesApiHouseholdsHouseholdIdCategoriesGet', params] as const,
  listSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet: (params: Record<string, unknown>) => [...queryKeys.households(), 'listSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet', params] as const,

  // transactions keys
  transactions: () => [...queryKeys.all, 'transactions'] as const,
  listTransactionsApiHouseholdsHouseholdIdTransactionsGet: (params: Record<string, unknown>) => [...queryKeys.transactions(), 'listTransactionsApiHouseholdsHouseholdIdTransactionsGet', params] as const,
  transactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet: (params: Record<string, unknown>) => [...queryKeys.transactions(), 'transactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet', params] as const,
  settlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet: (params: Record<string, unknown>) => [...queryKeys.transactions(), 'settlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet', params] as const,
  unsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet: (params: Record<string, unknown>) => [...queryKeys.transactions(), 'unsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet', params] as const,

  // budgets keys
  budgets: () => [...queryKeys.all, 'budgets'] as const,
  listBudgetsApiHouseholdsHouseholdIdBudgetsGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'listBudgetsApiHouseholdsHouseholdIdBudgetsGet', params] as const,
  budgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'budgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet', params] as const,
  myBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'myBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet', params] as const,
  warningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'warningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet', params] as const,
  overBudgetApiHouseholdsHouseholdIdBudgetsOverGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'overBudgetApiHouseholdsHouseholdIdBudgetsOverGet', params] as const,
  categorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet: (params: Record<string, unknown>) => [...queryKeys.budgets(), 'categorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet', params] as const,

  // default keys
  default: () => [...queryKeys.all, 'default'] as const,
  healthCheck: () => [...queryKeys.default(), 'healthCheck'] as const,

}