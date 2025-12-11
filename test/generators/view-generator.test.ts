/**
 * View Generator Tests
 *
 * Tests for TUI view component generation.
 */

import { describe, it, expect } from 'vitest'
import { generateViews } from '../../src/generators/view-generator.js'
import type { ParsedOpenAPI, ParsedEndpoint } from '../../src/generators/parser.js'

describe('ViewGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    title: 'Test API',
    version: '1.0.0',
    endpoints: [],
    schemas: [],
    ...overrides,
  })

  const createEndpoint = (overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint => ({
    path: '/accounts',
    method: 'get',
    operationId: 'list_accounts',
    responses: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate table view for list operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.tableViews.size).toBe(1)
      expect(result.tableViews.has('accounts')).toBe(true)

      const tableView = result.tableViews.get('accounts')!
      expect(tableView).toContain('export function AccountTableView')
      expect(tableView).toContain("import { useAccountsWithMeta } from '../entities/accounts'")
      expect(tableView).toContain("import DataTable from '../../tui/components/DataTable'")
      expect(tableView).toContain('const { data, columns, isReady } = useAccountsWithMeta()')
    })

    it('should generate detail view for get operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.detailViews.size).toBe(1)
      expect(result.detailViews.has('accounts')).toBe(true)

      const detailView = result.detailViews.get('accounts')!
      expect(detailView).toContain('export function AccountDetailView')
      expect(detailView).toContain("import { useAccount } from '../entities/accounts'")
      expect(detailView).toContain("import DetailView from '../../tui/components/DetailView'")
      expect(detailView).toContain('const { data, isLoading } = useAccount(id)')
    })

    it('should generate both views for entity with list and get', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.tableViews.size).toBe(1)
      expect(result.detailViews.size).toBe(1)
      expect(result.tableViews.has('accounts')).toBe(true)
      expect(result.detailViews.has('accounts')).toBe(true)
    })

    it('should generate index with lookup maps', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
          createEndpoint({ path: '/contacts', method: 'get', operationId: 'list_contacts' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', operationId: 'get_contact' }),
        ],
        schemas: [
          { name: 'Account', properties: [], type: 'object' },
          { name: 'Contact', properties: [], type: 'object' },
        ],
      })

      const result = generateViews(parsedAPI)

      expect(result.index).toContain("import { AccountTableView } from './accounts-table-view'")
      expect(result.index).toContain("import { AccountDetailView } from './accounts-detail-view'")
      expect(result.index).toContain("import { ContactTableView } from './contacts-table-view'")
      expect(result.index).toContain("import { ContactDetailView } from './contacts-detail-view'")
      expect(result.index).toContain('export const tableViews: Record<string, ComponentType<TableViewProps>> = {')
      expect(result.index).toContain('accounts: AccountTableView,')
      expect(result.index).toContain('contacts: ContactTableView,')
      expect(result.index).toContain('export const detailViews: Record<string, ComponentType<DetailViewProps>> = {')
      expect(result.index).toContain('accounts: AccountDetailView,')
      expect(result.index).toContain('contacts: ContactDetailView,')
    })

    it('should handle entities with only list operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.tableViews.size).toBe(1)
      expect(result.detailViews.size).toBe(0)
      expect(result.index).toContain('accounts: AccountTableView,')
      expect(result.index).not.toContain('AccountDetailView')
    })

    it('should handle entities with only get operation', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts/{id}', method: 'get', operationId: 'get_account' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.tableViews.size).toBe(0)
      expect(result.detailViews.size).toBe(1)
      expect(result.index).not.toContain('AccountTableView')
      expect(result.index).toContain('accounts: AccountDetailView,')
    })

    it('should handle underscore entity names', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/purchase_orders', method: 'get', operationId: 'list_purchase_orders' }),
          createEndpoint({ path: '/purchase_orders/{id}', method: 'get', operationId: 'get_purchase_order' }),
        ],
        schemas: [{ name: 'PurchaseOrder', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)

      expect(result.tableViews.has('purchase_orders')).toBe(true)
      expect(result.detailViews.has('purchase_orders')).toBe(true)

      const tableView = result.tableViews.get('purchase_orders')!
      expect(tableView).toContain('export function PurchaseOrderTableView')
      expect(tableView).toContain("import { usePurchaseOrdersWithMeta } from '../entities/purchase-orders'")

      const detailView = result.detailViews.get('purchase_orders')!
      expect(detailView).toContain('export function PurchaseOrderDetailView')
      expect(detailView).toContain("import { usePurchaseOrder } from '../entities/purchase-orders'")
    })

    it('should include JSDoc comments by default', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI)
      const tableView = result.tableViews.get('accounts')!

      expect(tableView).toContain('/**')
      expect(tableView).toContain(' * Account Table View Component')
      expect(tableView).toContain(' * Wires useAccountsWithMeta() hook to DataTable component.')
    })

    it('should skip JSDoc when includeJSDoc is false', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/accounts', method: 'get', operationId: 'list_accounts' }),
        ],
        schemas: [{ name: 'Account', properties: [], type: 'object' }],
      })

      const result = generateViews(parsedAPI, { includeJSDoc: false })
      const tableView = result.tableViews.get('accounts')!

      expect(tableView).not.toContain(' * Account Table View Component')
      expect(tableView).not.toContain(' * Wires useAccountsWithMeta() hook')
    })
  })
})
