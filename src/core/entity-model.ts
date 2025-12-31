/**
 * Entity Model - Core Types
 *
 * The canonical intermediate representation for code generation.
 * All generators consume this - no re-parsing of OpenAPI.
 */

/**
 * Sync mode determines how data is synchronized
 */
export type SyncMode = 'api' | 'realtime' | 'offline'

// =============================================================================
// UI METADATA TYPES
// These mirror the backend-patterns metadata system exactly
// =============================================================================

/**
 * UIType - Semantic display types (19 types)
 * Specifies HOW to display data, not storage or input methods.
 * Maps 1:1 with backend UIType enum.
 */
export type UIType =
  // Text (2 types)
  | 'text'      // Plain text display
  | 'password'  // Masked text (••••••••)
  // Numbers (3 types)
  | 'number'    // Numeric display with formatting
  | 'money'     // Currency display (format: {currency, decimals})
  | 'percent'   // Percentage display (0.45 → "45%")
  // Dates (2 types)
  | 'date'      // Date only
  | 'datetime'  // Date + time
  // Links/Clickable (3 types)
  | 'email'     // mailto: link
  | 'url'       // External link
  | 'phone'     // tel: link
  // Boolean (1 type)
  | 'boolean'   // Checkbox/Yes/No display
  // Visual Chips (2 types)
  | 'badge'     // Colored chip (hash-based color)
  | 'status'    // Semantic chip (format: {statusColors})
  // Entity References (2 types)
  | 'entity'    // Icon + name, clickable to detail
  | 'user'      // Avatar + name
  // Special (4 types)
  | 'json'      // Pretty-printed JSON
  | 'image'     // Image thumbnail
  | 'rating'    // Star rating display
  | 'color'     // Color swatch
  | 'file'      // File icon + name + size

/**
 * UIImportance - Business priority levels
 * Controls visibility and prominence in different view contexts.
 */
export type UIImportance = 'critical' | 'high' | 'medium' | 'low' | 'minimal'

/**
 * EntityReference - Resolution info for FK references
 * Used when type === 'entity' to enable automatic foreign key resolution.
 */
export interface EntityReference {
  /** Target entity name (plural): "categories", "accounts" */
  entity: string
  /** Field to display from resolved entity: "name", "title" */
  displayField: string
  /** Optional: endpoint to fetch single entity. Default: /{entity}/{id} */
  endpoint?: string
}

/**
 * ColumnMetadata - Complete field metadata for UI rendering
 * Mirrors backend ColumnMetadata Pydantic model exactly.
 */
export interface ColumnMetadata {
  /** Model field name */
  field: string
  /** Human-readable label */
  label: string
  /** Semantic UI type (19 values) */
  type: UIType
  /** Business priority */
  importance: UIImportance
  /** Logical grouping (e.g., "Financial") */
  group?: string
  /** Whether field can be sorted */
  sortable: boolean
  /** Whether field can be filtered */
  filterable: boolean
  /** Format hints: {"currency": "USD", "decimals": 2} */
  format?: Record<string, unknown>
  /** Help text for forms/tooltips */
  description?: string
  /** Placeholder text for inputs */
  placeholder?: string
  /** Whether visible by default */
  visible: boolean
  /** Whether field is required */
  required: boolean
  /** Whether computed/derived (read-only) */
  computed: boolean
  /** Field source: "system", "org", "user", "external:{type}" */
  source: 'system' | 'org' | 'user' | string
  /** Available choices (for BADGE/STATUS types) */
  options?: string[]
  /**
   * Present when type === 'entity'
   * Contains resolution info for FK references
   */
  reference?: EntityReference
}

/**
 * EntityUIConfig - Derived semantic field mapping
 * Auto-generated from ColumnMetadata by EntityConfigGenerator.
 */
export interface EntityUIConfig {
  /** First primary text field (for card titles, table primary column) */
  titleField?: string
  /** Second primary text field (for subtitles) */
  subtitleField?: string
  /** First primary money field (for value display) */
  valueField?: string
  /** First status field (for status badges) */
  statusField?: string
  /** Secondary/tertiary fields for metadata display */
  metadataFields: string[]
  /** Icon identifier (lucide icon name) */
  icon?: string
}

/**
 * The canonical intermediate representation.
 * All generators consume this - no re-parsing.
 */
export interface EntityModel {
  /** API metadata */
  info: ApiInfo

  /** Entity definitions keyed by plural name */
  entities: Map<string, EntityDefinition>

  /** Non-entity schemas (e.g., ValidationError, shared types) */
  sharedSchemas: SchemaDefinition[]

  /** Auth configuration */
  auth: AuthConfig
}

export interface ApiInfo {
  title: string
  version: string
  description?: string
  baseUrl?: string
}

export interface EntityDefinition {
  /** Plural name: 'accounts' */
  name: string
  /** Singular name: 'account' */
  singular: string
  /** PascalCase: 'Account' */
  pascalName: string
  /** Sync mode from x-sync-mode extension */
  syncMode: SyncMode

  /** Standard CRUD operations (detected from endpoints) */
  operations: CrudOperations

  /** Non-CRUD operations (e.g., /accounts/{id}/transition) */
  customOperations: OperationDefinition[]

  /** Metadata endpoint if detected */
  metadataOperation?: OperationDefinition

  /** Related schema names */
  schemas: EntitySchemas

  // UI METADATA (populated from x-ui extensions or /columns endpoint)

  /** Static column metadata from OpenAPI schema x-ui extensions */
  columnMetadata?: ColumnMetadata[]

  /** Derived UI configuration (titleField, statusField, etc.) */
  uiConfig?: EntityUIConfig
}

export interface CrudOperations {
  list?: OperationDefinition
  get?: OperationDefinition
  create?: OperationDefinition
  update?: OperationDefinition
  delete?: OperationDefinition
}

export interface OperationDefinition {
  /** Original operationId from OpenAPI */
  operationId: string
  /** HTTP method */
  method: HttpMethod
  /** Full path: '/api/v1/accounts/{account_id}' */
  path: string
  /** Summary/description */
  summary?: string
  /** Path parameters */
  pathParams: ParameterDefinition[]
  /** Query parameters */
  queryParams: ParameterDefinition[]
  /** Request body schema (for POST/PUT/PATCH) */
  requestSchema?: SchemaReference
  /** Response schema (200/201) */
  responseSchema?: SchemaReference
  /** Whether auth is required */
  requiresAuth: boolean
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface EntitySchemas {
  /** List response type: 'AccountListResponse' */
  listResponse?: string
  /** Single item type: 'Account' */
  item?: string
  /** Create request type: 'AccountCreate' */
  createRequest?: string
  /** Update request type: 'AccountUpdate' */
  updateRequest?: string
}

export interface SchemaDefinition {
  name: string
  type: 'object' | 'enum' | 'array' | 'primitive'
  properties?: Record<string, PropertyDefinition>
  enumValues?: (string | number)[]
  required?: string[]
  description?: string
}

export interface PropertyDefinition {
  name: string
  type: string
  format?: string
  nullable?: boolean
  description?: string
  ref?: string

  // UI METADATA (from x-ui-* OpenAPI extensions)

  /** Semantic UI type override (x-ui-type) */
  uiType?: UIType
  /** Business importance (x-ui-importance) */
  uiImportance?: UIImportance
  /** Logical field grouping (x-ui-group) */
  uiGroup?: string
  /** Custom label (x-ui-label) */
  uiLabel?: string
  /** Format hints (x-ui-format) */
  uiFormat?: Record<string, unknown>
  /** Whether sortable (x-ui-sortable) */
  uiSortable?: boolean
  /** Whether filterable (x-ui-filterable) */
  uiFilterable?: boolean
  /** Whether visible by default (x-ui-visible) */
  uiVisible?: boolean
  /** Help text (x-ui-help) */
  uiHelp?: string
  /** Input placeholder (x-ui-placeholder) */
  uiPlaceholder?: string
  /** Available choices for status/badge (from enum or x-ui-options) */
  uiOptions?: string[]
  /** Entity reference info for FK fields (x-ui-reference) */
  uiReference?: {
    entity: string
    displayField?: string
  }
}

export interface ParameterDefinition {
  name: string
  type: string
  format?: string
  required: boolean
  description?: string
  default?: unknown
  enumValues?: (string | number)[]
}

export interface SchemaReference {
  /** Schema name (e.g., 'AccountListResponse') */
  name: string
  /** Whether the response is an array of this type */
  isArray: boolean
  /** For paginated responses: the property containing the array */
  arrayProperty?: string
}

export interface AuthConfig {
  type: 'bearer' | 'apiKey' | 'oauth2' | 'none'
  headerName?: string
  schemes: AuthScheme[]
}

export interface AuthScheme {
  name: string
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: string
  bearerFormat?: string
}

/**
 * Helper to create an empty EntityModel
 */
export function createEmptyEntityModel(): EntityModel {
  return {
    info: { title: '', version: '' },
    entities: new Map(),
    sharedSchemas: [],
    auth: { type: 'none', schemes: [] },
  }
}

/**
 * Helper to create an empty EntityDefinition
 */
export function createEmptyEntityDefinition(name: string): EntityDefinition {
  const singular = singularize(name)
  return {
    name,
    singular,
    pascalName: toPascalCase(singular),
    syncMode: 'api',
    operations: {},
    customOperations: [],
    schemas: {},
  }
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

/**
 * Simple singularization (handles common cases)
 */
export function singularize(str: string): string {
  if (str.endsWith('ies')) {
    return str.slice(0, -3) + 'y'
  }
  if (str.endsWith('ses') || str.endsWith('xes') || str.endsWith('ches') || str.endsWith('shes')) {
    return str.slice(0, -2)
  }
  if (str.endsWith('s') && !str.endsWith('ss')) {
    return str.slice(0, -1)
  }
  return str
}

// =============================================================================
// UI METADATA HELPERS
// =============================================================================

/**
 * Infer UIType from OpenAPI type and format
 * Matches backend introspection logic - pure type mapping, no heuristics.
 */
export function inferUIType(type: string, format?: string): UIType {
  // Format-based detection first (more specific)
  if (format === 'email') return 'email'
  if (format === 'uri' || format === 'url') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime'
  if (format === 'password') return 'password'
  if (format === 'uuid') return 'text' // UUIDs display as text

  // Type-based detection
  switch (type) {
    case 'boolean':
      return 'boolean'
    case 'integer':
    case 'number':
      return 'number' // NOT 'money' - must be explicit
    case 'array':
    case 'object':
      return 'json'
    default:
      return 'text'
  }
}

/**
 * Convert field name to human-readable label
 * "created_at" → "Created At", "dealValue" → "Deal Value"
 */
export function toLabel(fieldName: string): string {
  return fieldName
    // Split on snake_case and camelCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    // Capitalize each word
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Convert PropertyDefinition to ColumnMetadata
 * Applies UI metadata overrides from x-ui-* extensions.
 */
export function propertyToColumnMetadata(
  prop: PropertyDefinition,
  required: boolean = false
): ColumnMetadata {
  const type = prop.uiType ?? inferUIType(prop.type, prop.format)

  const column: ColumnMetadata = {
    field: prop.name,
    label: prop.uiLabel ?? toLabel(prop.name),
    type,
    importance: prop.uiImportance ?? 'medium',
    group: prop.uiGroup,
    sortable: prop.uiSortable ?? true,
    filterable: prop.uiFilterable ?? true,
    format: prop.uiFormat,
    description: prop.uiHelp ?? prop.description,
    placeholder: prop.uiPlaceholder,
    visible: prop.uiVisible ?? true,
    required,
    computed: false,
    source: 'system',
    options: prop.uiOptions,
  }

  // Add reference info for entity-like type fields (entity, user)
  // Both types represent FK references that need resolution
  if ((type === 'entity' || type === 'user') && prop.uiReference) {
    column.reference = {
      entity: prop.uiReference.entity,
      displayField: prop.uiReference.displayField ?? 'name',
    }
  }

  return column
}

/**
 * Derive EntityUIConfig from ColumnMetadata array
 * Auto-detects titleField, statusField, valueField based on importance and type.
 */
export function deriveEntityUIConfig(
  columns: ColumnMetadata[],
  entityName: string
): EntityUIConfig {
  // Primary columns (critical or high importance)
  const primaryCols = columns.filter(
    (c) => c.importance === 'critical' || c.importance === 'high'
  )

  // Find semantic fields
  const primaryTextFields = primaryCols.filter((c) => c.type === 'text')
  const titleField = primaryTextFields[0]?.field
  const subtitleField = primaryTextFields[1]?.field
  const valueField = primaryCols.find((c) => c.type === 'money')?.field
  const statusField = columns.find((c) => c.type === 'status')?.field

  // Metadata fields (medium/low importance, visible)
  const metadataFields = columns
    .filter(
      (c) =>
        (c.importance === 'medium' || c.importance === 'low') &&
        c.visible &&
        c.field !== titleField &&
        c.field !== subtitleField
    )
    .map((c) => c.field)

  // Infer icon from entity name (convention-based)
  const icon = inferEntityIcon(entityName)

  return {
    titleField,
    subtitleField,
    valueField,
    statusField,
    metadataFields,
    icon,
  }
}

/**
 * Infer icon from entity name (convention-based mapping)
 */
export function inferEntityIcon(entityName: string): string {
  const singular = singularize(entityName.toLowerCase())
  const iconMap: Record<string, string> = {
    account: 'Building2',
    contact: 'User',
    deal: 'DollarSign',
    activity: 'Calendar',
    task: 'CheckSquare',
    note: 'FileText',
    file: 'File',
    user: 'User',
    organization: 'Building',
    product: 'Package',
    order: 'ShoppingCart',
    invoice: 'Receipt',
    payment: 'CreditCard',
    project: 'Folder',
    team: 'Users',
    category: 'Tag',
    tag: 'Hash',
  }
  return iconMap[singular] ?? 'FileText'
}
