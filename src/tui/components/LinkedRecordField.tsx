/**
 * LinkedRecordField Component
 *
 * Renders a foreign key field by fetching and displaying the linked record's name.
 * Handles loading states, errors, and orphaned/deleted records.
 */

import React from 'react'
import { Text } from 'ink'
import { useLinkedRecord } from '../hooks/useLinkedRecord.js'
import { renderEntity } from '../renderers/reference.js'

export interface LinkedRecordFieldProps {
  /** Foreign key value (UUID or ID) */
  value: string
  /** Entity type to fetch from (e.g., "accounts", "contacts") */
  entityType: string
  /** Whether this field is currently focused/selected */
  isFocused?: boolean
}

/**
 * Derive entity type name for icon (singular form)
 */
function deriveEntityIconType(entityType: string): string {
  // Remove trailing 's' to get singular
  let singular = entityType
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1)
  }
  return singular
}

/**
 * LinkedRecordField component
 */
export default function LinkedRecordField({
  value,
  entityType,
  isFocused: _isFocused = false,
}: LinkedRecordFieldProps) {
  // isFocused reserved for future highlight styling
  void _isFocused
  const { displayName, isLoading, error, exists } = useLinkedRecord(entityType, value)

  // Determine icon type from entity type
  const iconType = deriveEntityIconType(entityType)

  // Render the field using the entity renderer
  const rendered = renderEntity(value, {
    type: iconType,
    displayName,
    isLink: true,
    isLoading,
    notFound: !exists && !isLoading && !error,
  })

  return <Text>{rendered}</Text>
}
