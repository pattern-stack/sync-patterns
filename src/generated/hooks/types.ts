/**
 * Hook Types
 *
 * Auto-generated React hooks from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

// Bulk operation types (inlined for standalone generated code)
export interface BulkOperationRequest<T = unknown> {
  items: T[]
  options?: { continueOnError?: boolean; batchSize?: number }
}

export interface BulkOperationResponse<T = unknown> {
  successful: T[]
  failed: Array<{ item: T; error: string }>
  total: number
  successCount: number
  failureCount: number
}

export interface BulkOperationProgress {
  completed: number
  total: number
  current?: unknown
}

export interface BulkMutationOptions {
  onProgress?: (progress: BulkOperationProgress) => void
}

export interface ListmyhouseholdsapihouseholdsgetParams { database_url?: any }

export interface CreatehouseholdapihouseholdspostParams { database_url?: any }

export interface CreatehouseholdapihouseholdspostData { [key: string]: unknown }

export interface GethouseholdapihouseholdshouseholdidgetParams { household_id: string; database_url?: any }

export interface InvitememberapihouseholdshouseholdidinvitepostParams { household_id: string; user_id: string; role?: string; database_url?: any }

export interface InvitememberapihouseholdshouseholdidinvitepostData { pathParams: { household_id: string; user_id: string; role?: string; database_url?: any }; [key: string]: unknown }

export interface AcceptinvitationapimembershipsmembershipidacceptpostParams { membership_id: string; household_id: string; database_url?: any }

export interface AcceptinvitationapimembershipsmembershipidacceptpostData { pathParams: { membership_id: string; household_id: string; database_url?: any }; [key: string]: unknown }

export interface DeclineinvitationapimembershipsmembershipiddeclinepostParams { membership_id: string; household_id: string; database_url?: any }

export interface DeclineinvitationapimembershipsmembershipiddeclinepostData { pathParams: { membership_id: string; household_id: string; database_url?: any }; [key: string]: unknown }

export interface ListmembersapihouseholdshouseholdidmembersgetParams { household_id: string; database_url?: any }

export interface ListaccountsapihouseholdshouseholdidaccountsgetParams { household_id: string; database_url?: any }

export interface CreateaccountapihouseholdshouseholdidaccountspostParams { household_id: string; database_url?: any }

export interface CreateaccountapihouseholdshouseholdidaccountspostData { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }

export interface GetaccountapihouseholdshouseholdidaccountsaccountidgetParams { household_id: string; account_id: string; database_url?: any }

export interface UpdateaccountapihouseholdshouseholdidaccountsaccountidpatchParams { household_id: string; account_id: string; database_url?: any }

export interface UpdateaccountapihouseholdshouseholdidaccountsaccountidpatchData { pathParams: { household_id: string; account_id: string; database_url?: any }; [key: string]: unknown }

export interface ListcategoriesapihouseholdshouseholdidcategoriesgetParams { household_id: string; database_url?: any }

export interface CreatecategoryapihouseholdshouseholdidcategoriespostParams { household_id: string; database_url?: any }

export interface CreatecategoryapihouseholdshouseholdidcategoriespostData { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }

export interface ListsubcategoriesapihouseholdshouseholdidsubcategoriesgetParams { household_id: string; category_id?: any; database_url?: any }

export interface CreatesubcategoryapihouseholdshouseholdidsubcategoriespostParams { household_id: string; database_url?: any }

export interface CreatesubcategoryapihouseholdshouseholdidsubcategoriespostData { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }

export interface ListtransactionsapihouseholdshouseholdidtransactionsgetParams { household_id: string; account_id?: any; state?: any; limit?: number; offset?: number; database_url?: any }

export interface CreatetransactionapihouseholdshouseholdidtransactionspostParams { household_id: string; database_url?: any }

export interface CreatetransactionapihouseholdshouseholdidtransactionspostData { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }

export interface GettransactionapihouseholdshouseholdidtransactionstransactionidgetParams { household_id: string; transaction_id: string; database_url?: any }

export interface UpdatetransactionapihouseholdshouseholdidtransactionstransactionidpatchParams { household_id: string; transaction_id: string; database_url?: any }

export interface UpdatetransactionapihouseholdshouseholdidtransactionstransactionidpatchData { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }

export interface FinalizetransactionapihouseholdshouseholdidtransactionstransactionidfinalizepostParams { household_id: string; transaction_id: string; database_url?: any }

export interface FinalizetransactionapihouseholdshouseholdidtransactionstransactionidfinalizepostData { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }

export interface VoidtransactionapihouseholdshouseholdidtransactionstransactionidvoidpostParams { household_id: string; transaction_id: string; database_url?: any }

export interface VoidtransactionapihouseholdshouseholdidtransactionstransactionidvoidpostData { pathParams: { household_id: string; transaction_id: string; database_url?: any }; [key: string]: unknown }

export interface ReassignbudgetapihouseholdshouseholdidtransactionstransactionidreassignpostParams { household_id: string; transaction_id: string; budget_owner_type: string; budget_owner_user_id?: any; database_url?: any }

export interface ReassignbudgetapihouseholdshouseholdidtransactionstransactionidreassignpostData { pathParams: { household_id: string; transaction_id: string; budget_owner_type: string; budget_owner_user_id?: any; database_url?: any }; [key: string]: unknown }

export interface GetsettlementsummaryapihouseholdshouseholdidsettlementssummarygetParams { household_id: string; user_id?: any; transaction_id: string; database_url?: any }

export interface GetunsettledtransactionsapihouseholdshouseholdidsettlementsunsettledgetParams { household_id: string; owed_by_user_id?: any; owed_to_user_id?: any; transaction_id: string; database_url?: any }

export interface RecordsettlementpaymentapihouseholdshouseholdidsettlementspostParams { household_id: string; owed_by_user_id: string; owed_to_user_id: string; amount: any; transaction_id: string; database_url?: any }

export interface RecordsettlementpaymentapihouseholdshouseholdidsettlementspostData { pathParams: { household_id: string; owed_by_user_id: string; owed_to_user_id: string; amount: any; transaction_id: string; database_url?: any }; [key: string]: unknown }

export interface ListbudgetsapihouseholdshouseholdidbudgetsgetParams { household_id: string; month: string; budget_type?: any; user_id?: any; database_url?: any }

export interface CreatebudgetapihouseholdshouseholdidbudgetspostParams { household_id: string; database_url?: any }

export interface CreatebudgetapihouseholdshouseholdidbudgetspostData { pathParams: { household_id: string; database_url?: any }; [key: string]: unknown }

export interface GetbudgetapihouseholdshouseholdidbudgetsbudgetidgetParams { household_id: string; budget_id: string; database_url?: any }

export interface UpdatebudgetapihouseholdshouseholdidbudgetsbudgetidpatchParams { household_id: string; budget_id: string; database_url?: any }

export interface UpdatebudgetapihouseholdshouseholdidbudgetsbudgetidpatchData { pathParams: { household_id: string; budget_id: string; database_url?: any }; [key: string]: unknown }

export interface DeletebudgetapihouseholdshouseholdidbudgetsbudgetiddeleteParams { household_id: string; budget_id: string; database_url?: any }

export interface DeletebudgetapihouseholdshouseholdidbudgetsbudgetiddeleteData { pathParams: { household_id: string; budget_id: string; database_url?: any }; [key: string]: unknown }

export interface GetmybudgetsummaryapihouseholdshouseholdidbudgetssummarygetParams { household_id: string; month: string; budget_id: string; database_url?: any }

export interface GetwarningbudgetsapihouseholdshouseholdidbudgetswarningsgetParams { household_id: string; month: string; budget_id: string; database_url?: any }

export interface GetoverbudgetapihouseholdshouseholdidbudgetsovergetParams { household_id: string; month: string; budget_id: string; database_url?: any }

export interface GetcategoryspendingapihouseholdshouseholdidbudgetsspendinggetParams { household_id: string; month: string; budget_type?: string; budget_id: string; database_url?: any }
