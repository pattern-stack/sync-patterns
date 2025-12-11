/**
 * Mutation Hooks
 *
 * Auto-generated React hooks from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { apiClient } from '../client/index'
import { queryKeys } from './keys'

/**
 * Create Household
 * Create a new household with current user as owner.

Returns household with membership information.
 */
export function useCreateHouseholdApiHouseholdsPost(options?: UseMutationOptions<unknown, unknown, { [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) => apiClient.createHouseholdApiHouseholdsPost({ data }),
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Invite Member
 * Invite a user to the household.

Requires: Must be owner or admin.

Args:
    household_id: Household to invite to
    user_id: User to invite
    role: Role to assign (owner, admin, member)
 */
export function useInviteMemberApiHouseholdsHouseholdIdInvitePost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; user_id: string; role?: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.inviteMemberApiHouseholdsHouseholdIdInvitePost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Accept Invitation
 * Accept a pending household invitation.

Requires: Must be the invited user.
 */
export function useAcceptInvitationApiMembershipsMembershipIdAcceptPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { membership_id: string; household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { membership_id } = pathParams
      return apiClient.acceptInvitationApiMembershipsMembershipIdAcceptPost(membership_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Decline Invitation
 * Decline a pending household invitation.

Requires: Must be the invited user.
 */
export function useDeclineInvitationApiMembershipsMembershipIdDeclinePost(options?: UseMutationOptions<unknown, unknown, { pathParams: { membership_id: string; household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { membership_id } = pathParams
      return apiClient.declineInvitationApiMembershipsMembershipIdDeclinePost(membership_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Create Account
 * Create a financial account.

Requires: Must be owner or admin.
 */
export function useCreateAccountApiHouseholdsHouseholdIdAccountsPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.createAccountApiHouseholdsHouseholdIdAccountsPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Update Account
 * Update account details.

Requires: Must be owner or admin.
 */
export function useUpdateAccountApiHouseholdsHouseholdIdAccountsAccountIdPatch(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; account_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, account_id } = pathParams
      return apiClient.updateAccountApiHouseholdsHouseholdIdAccountsAccountIdPatch(household_id, account_id, { data })
    },
    onMutate: async (variables: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      const previousData = queryClient.getQueryData(queryKeys.households())

      // Update specific item in cache
      const { pathParams, ...updateData } = variables as { pathParams?: Record<string, unknown>; [key: string]: unknown }
      const typedUpdateData = updateData as Record<string, unknown>
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((item: unknown) => {
            const typedItem = item as Record<string, unknown>
            return typedItem.id === pathParams?.id || typedItem.id === pathParams?.household_id
              ? { ...typedItem, ...typedUpdateData }
              : item
          })
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Create Category
 * Create a category.

Requires: Must be owner or admin.
 */
export function useCreateCategoryApiHouseholdsHouseholdIdCategoriesPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.createCategoryApiHouseholdsHouseholdIdCategoriesPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Create Subcategory
 * Create a subcategory.

Requires: Must be owner or admin.
 */
export function useCreateSubcategoryApiHouseholdsHouseholdIdSubcategoriesPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.createSubcategoryApiHouseholdsHouseholdIdSubcategoriesPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.households() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.households())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.households(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.households(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.households() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Create Transaction
 * Create a new transaction in draft state.

Requires: Must be household member with visibility to the account.
 */
export function useCreateTransactionApiHouseholdsHouseholdIdTransactionsPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.createTransactionApiHouseholdsHouseholdIdTransactionsPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Update Transaction
 * Update a draft transaction.

Requires: Must have visibility to transaction's account.
Note: Can only update transactions in draft state.
 */
export function useUpdateTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdPatch(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, transaction_id } = pathParams
      return apiClient.updateTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdPatch(household_id, transaction_id, { data })
    },
    onMutate: async (variables: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Update specific item in cache
      const { pathParams, ...updateData } = variables as { pathParams?: Record<string, unknown>; [key: string]: unknown }
      const typedUpdateData = updateData as Record<string, unknown>
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((item: unknown) => {
            const typedItem = item as Record<string, unknown>
            return typedItem.id === pathParams?.id || typedItem.id === pathParams?.transaction_id
              ? { ...typedItem, ...typedUpdateData }
              : item
          })
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Finalize Transaction
 * Finalize a draft transaction.

Transitions draft → final and calculates settlement amounts.
Requires: Must have visibility to transaction's account.
 */
export function useFinalizeTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdFinalizePost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, transaction_id } = pathParams
      return apiClient.finalizeTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdFinalizePost(household_id, transaction_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Void Transaction
 * Void a transaction.

Transitions to voided state (from any state).
Requires: Must be owner or admin.
 */
export function useVoidTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdVoidPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, transaction_id } = pathParams
      return apiClient.voidTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdVoidPost(household_id, transaction_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Reassign Budget
 * Reassign transaction to different budget owner.

Use case: "I paid with my card but this should be a shared expense"

Requires: Must have visibility to transaction's account.

Args:
    household_id: Household containing the transaction
    transaction_id: Transaction to reassign
    budget_owner_type: PERSONAL or SHARED
    budget_owner_user_id: Required if budget_owner_type=PERSONAL
 */
export function useReassignBudgetApiHouseholdsHouseholdIdTransactionsTransactionIdReassignPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; transaction_id: string; budget_owner_type: string; budget_owner_user_id?: any; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, transaction_id } = pathParams
      return apiClient.reassignBudgetApiHouseholdsHouseholdIdTransactionsTransactionIdReassignPost(household_id, transaction_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Record Settlement Payment
 * Record a settlement payment between users.

Applies payment FIFO to oldest unsettled transactions.

Requires: Must be one of the users involved, or be an admin.

Args:
    household_id: The household
    owed_by_user_id: User making the payment (debtor)
    owed_to_user_id: User receiving payment (creditor)
    amount: Amount being settled
 */
export function useRecordSettlementPaymentApiHouseholdsHouseholdIdSettlementsPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; owed_by_user_id: string; owed_to_user_id: string; amount: any; transaction_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.recordSettlementPaymentApiHouseholdsHouseholdIdSettlementsPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.transactions())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.transactions(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Create Budget
 * Create a budget.

Requires: Must be owner or admin.
 */
export function useCreateBudgetApiHouseholdsHouseholdIdBudgetsPost(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id } = pathParams
      return apiClient.createBudgetApiHouseholdsHouseholdIdBudgetsPost(household_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.budgets() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.budgets())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.budgets(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.budgets(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Update Budget
 * Update a budget.

Requires: Must be owner or admin.
 */
export function useUpdateBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdPatch(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; budget_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, budget_id } = pathParams
      return apiClient.updateBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdPatch(household_id, budget_id, { data })
    },
    onMutate: async (variables: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.budgets() })

      const previousData = queryClient.getQueryData(queryKeys.budgets())

      // Update specific item in cache
      const { pathParams, ...updateData } = variables as { pathParams?: Record<string, unknown>; [key: string]: unknown }
      const typedUpdateData = updateData as Record<string, unknown>
      queryClient.setQueryData(queryKeys.budgets(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((item: unknown) => {
            const typedItem = item as Record<string, unknown>
            return typedItem.id === pathParams?.id || typedItem.id === pathParams?.budget_id
              ? { ...typedItem, ...typedUpdateData }
              : item
          })
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.budgets(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}

/**
 * Delete Budget
 * Delete a budget.

Requires: Must be owner or admin.
 */
export function useDeleteBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdDelete(options?: UseMutationOptions<unknown, unknown, { pathParams: { household_id: string; budget_id: string; database_url?: any }; [key: string]: unknown }, { previousData?: unknown }>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pathParams, ...data }) => {
      const { household_id, budget_id } = pathParams
      return apiClient.deleteBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdDelete(household_id, budget_id, { data })
    },
    onMutate: async (data: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.budgets() })

      const previousData = queryClient.getQueryData(queryKeys.budgets())

      // Remove item from cache
      queryClient.setQueryData(queryKeys.budgets(), (old: unknown) => {
        if (Array.isArray(old)) {
          const idToDelete = (data.pathParams as Record<string, unknown>)?.id || (data.pathParams as Record<string, unknown>)?.budget_id || data
          return old.filter((item: unknown) => (item as Record<string, unknown>).id !== idToDelete)
        }
        return old
      })

      return { previousData }
    },
    onError: (_error: unknown, _variables: Record<string, unknown>, context: { previousData?: unknown } | undefined) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.budgets(), context.previousData)
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },
    ...options
  })
}
