/**
 * API Methods
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually
 */

import { APIClient } from './client'
import { RequestOptions } from './types'

export class APIService {
  constructor(private client: APIClient) {}

  // households methods
  /**
   * List My Households
   * List all households the current user is a member of.
   * @param options Request options
   */
  async listMyHouseholdsApiHouseholdsGet(options: RequestOptions = {}): Promise<any> {
    const url = '/api/households'
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Household
   * Create a new household with current user as owner.

Returns household with membership information.
   * @param options Request options
   */
  async createHouseholdApiHouseholdsPost(options: RequestOptions = {}): Promise<any> {
    const url = '/api/households'
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  /**
   * Get Household
   * Get household details with member list.

Requires: Must be a household member.
   * @param options Request options
   */
  async getHouseholdApiHouseholdsHouseholdIdGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Invite Member
   * Invite a user to the household.

Requires: Must be owner or admin.

Args:
    household_id: Household to invite to
    user_id: User to invite
    role: Role to assign (owner, admin, member)
   * @param options Request options
   */
  async inviteMemberApiHouseholdsHouseholdIdInvitePost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/invite`
    const queryParams = {
      user_id: options.user_id,
      role: options.role,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  /**
   * Accept Invitation
   * Accept a pending household invitation.

Requires: Must be the invited user.
   * @param options Request options
   */
  async acceptInvitationApiMembershipsMembershipIdAcceptPost(membership_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/memberships/${membership_id}/accept`
    const queryParams = {
      household_id: options.household_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  /**
   * Decline Invitation
   * Decline a pending household invitation.

Requires: Must be the invited user.
   * @param options Request options
   */
  async declineInvitationApiMembershipsMembershipIdDeclinePost(membership_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/memberships/${membership_id}/decline`
    const queryParams = {
      household_id: options.household_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  /**
   * List Members
   * List household members.

Requires: Must be a household member.
   * @param options Request options
   */
  async listMembersApiHouseholdsHouseholdIdMembersGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/members`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * List Accounts
   * List accounts visible to current user.

Requires: Must be a household member.
Returns only accounts the current user has visibility to.
   * @param options Request options
   */
  async listAccountsApiHouseholdsHouseholdIdAccountsGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/accounts`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Account
   * Create a financial account.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async createAccountApiHouseholdsHouseholdIdAccountsPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/accounts`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  /**
   * Get Account
   * Get account details.

Requires: Must be member and have account visibility.
   * @param options Request options
   */
  async getAccountApiHouseholdsHouseholdIdAccountsAccountIdGet(household_id: string, account_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/accounts/${account_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Update Account
   * Update account details.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async updateAccountApiHouseholdsHouseholdIdAccountsAccountIdPatch(household_id: string, account_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/accounts/${account_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.patch<any>(url, options.data, options)
  }

  /**
   * List Categories
   * List household categories.

Requires: Must be a household member.
   * @param options Request options
   */
  async listCategoriesApiHouseholdsHouseholdIdCategoriesGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/categories`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Category
   * Create a category.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async createCategoryApiHouseholdsHouseholdIdCategoriesPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/categories`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  /**
   * List Subcategories
   * List household subcategories.

Requires: Must be a household member.

Args:
    household_id: Household to query
    category_id: Optional filter to specific category
   * @param options Request options
   */
  async listSubcategoriesApiHouseholdsHouseholdIdSubcategoriesGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/subcategories`
    const queryParams = {
      category_id: options.category_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Subcategory
   * Create a subcategory.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async createSubcategoryApiHouseholdsHouseholdIdSubcategoriesPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/subcategories`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  // transactions methods
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
   * @param options Request options
   */
  async listTransactionsApiHouseholdsHouseholdIdTransactionsGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions`
    const queryParams = {
      account_id: options.account_id,
      state: options.state,
      limit: options.limit,
      offset: options.offset,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Transaction
   * Create a new transaction in draft state.

Requires: Must be household member with visibility to the account.
   * @param options Request options
   */
  async createTransactionApiHouseholdsHouseholdIdTransactionsPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  /**
   * Get Transaction
   * Get transaction details.

Requires: Must have visibility to transaction's account.
   * @param options Request options
   */
  async getTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdGet(household_id: string, transaction_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions/${transaction_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Update Transaction
   * Update a draft transaction.

Requires: Must have visibility to transaction's account.
Note: Can only update transactions in draft state.
   * @param options Request options
   */
  async updateTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdPatch(household_id: string, transaction_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions/${transaction_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.patch<any>(url, options.data, options)
  }

  /**
   * Finalize Transaction
   * Finalize a draft transaction.

Transitions draft → final and calculates settlement amounts.
Requires: Must have visibility to transaction's account.
   * @param options Request options
   */
  async finalizeTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdFinalizePost(household_id: string, transaction_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions/${transaction_id}/finalize`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  /**
   * Void Transaction
   * Void a transaction.

Transitions to voided state (from any state).
Requires: Must be owner or admin.
   * @param options Request options
   */
  async voidTransactionApiHouseholdsHouseholdIdTransactionsTransactionIdVoidPost(household_id: string, transaction_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions/${transaction_id}/void`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
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
   * @param options Request options
   */
  async reassignBudgetApiHouseholdsHouseholdIdTransactionsTransactionIdReassignPost(household_id: string, transaction_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/transactions/${transaction_id}/reassign`
    const queryParams = {
      budget_owner_type: options.budget_owner_type,
      budget_owner_user_id: options.budget_owner_user_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  /**
   * Get Settlement Summary
   * Get settlement summary for a user.

Requires: Must be a household member.

Args:
    household_id: The household
    user_id: User to get summary for (defaults to current user)
   * @param options Request options
   */
  async getSettlementSummaryApiHouseholdsHouseholdIdSettlementsSummaryGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/settlements/summary`
    const queryParams = {
      user_id: options.user_id,
      transaction_id: options.transaction_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Get Unsettled Transactions
   * Get unsettled transactions for settlement view.

Requires: Must be a household member.

Args:
    household_id: The household
    owed_by_user_id: Optional filter to debtor
    owed_to_user_id: Optional filter to creditor
   * @param options Request options
   */
  async getUnsettledTransactionsApiHouseholdsHouseholdIdSettlementsUnsettledGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/settlements/unsettled`
    const queryParams = {
      owed_by_user_id: options.owed_by_user_id,
      owed_to_user_id: options.owed_to_user_id,
      transaction_id: options.transaction_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
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
   * @param options Request options
   */
  async recordSettlementPaymentApiHouseholdsHouseholdIdSettlementsPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/settlements`
    const queryParams = {
      owed_by_user_id: options.owed_by_user_id,
      owed_to_user_id: options.owed_to_user_id,
      amount: options.amount,
      transaction_id: options.transaction_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options)
  }

  // budgets methods
  /**
   * List Budgets
   * List budgets with progress for a month.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to get budgets for (YYYY-MM-DD format)
    budget_type: Optional filter by type (personal, shared)
    user_id: Optional filter by user (for personal budgets)
   * @param options Request options
   */
  async listBudgetsApiHouseholdsHouseholdIdBudgetsGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets`
    const queryParams = {
      month: options.month,
      budget_type: options.budget_type,
      user_id: options.user_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Create Budget
   * Create a budget.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async createBudgetApiHouseholdsHouseholdIdBudgetsPost(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.post<any>(url, options.data, options)
  }

  /**
   * Get Budget
   * Get budget with current progress.

Requires: Must be a household member.
   * @param options Request options
   */
  async getBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdGet(household_id: string, budget_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/${budget_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Update Budget
   * Update a budget.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async updateBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdPatch(household_id: string, budget_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/${budget_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.patch<any>(url, options.data, options)
  }

  /**
   * Delete Budget
   * Delete a budget.

Requires: Must be owner or admin.
   * @param options Request options
   */
  async deleteBudgetApiHouseholdsHouseholdIdBudgetsBudgetIdDelete(household_id: string, budget_id: string, options: RequestOptions = {}): Promise<void> {
    const url = `/api/households/${household_id}/budgets/${budget_id}`
    const queryParams = {
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.delete<void>(url, options)
  }

  /**
   * Get My Budget Summary
   * Get budget summary for current user.

Returns personal and shared budget overview with totals.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to get summary for (YYYY-MM-DD format)
   * @param options Request options
   */
  async getMyBudgetSummaryApiHouseholdsHouseholdIdBudgetsSummaryGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/summary`
    const queryParams = {
      month: options.month,
      budget_id: options.budget_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Get Warning Budgets
   * Get budgets approaching limit (80%+ spent).

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to check (YYYY-MM-DD format)
   * @param options Request options
   */
  async getWarningBudgetsApiHouseholdsHouseholdIdBudgetsWarningsGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/warnings`
    const queryParams = {
      month: options.month,
      budget_id: options.budget_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  /**
   * Get Over Budget
   * Get budgets that are over limit.

Requires: Must be a household member.

Args:
    household_id: Household to query
    month: Month to check (YYYY-MM-DD format)
   * @param options Request options
   */
  async getOverBudgetApiHouseholdsHouseholdIdBudgetsOverGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/over`
    const queryParams = {
      month: options.month,
      budget_id: options.budget_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
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
   * @param options Request options
   */
  async getCategorySpendingApiHouseholdsHouseholdIdBudgetsSpendingGet(household_id: string, options: RequestOptions = {}): Promise<any> {
    const url = `/api/households/${household_id}/budgets/spending`
    const queryParams = {
      month: options.month,
      budget_type: options.budget_type,
      budget_id: options.budget_id,
      database_url: options.database_url,
    }
    options.params = { ...queryParams, ...options.params }
    return this.client.get<any>(url, options)
  }

  // default methods
  /**
   * Health Check
   * Health check endpoint.
   * @param options Request options
   */
  async healthCheck(options: RequestOptions = {}): Promise<any> {
    const url = '/api/v1/health'
    return this.client.get<any>(url, options)
  }

}