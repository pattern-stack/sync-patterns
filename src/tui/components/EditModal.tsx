/**
 * EditModal Component
 *
 * Modal overlay for editing record fields.
 * Generates form inputs based on field metadata and UIType.
 * Handles validation, API updates, and user feedback.
 *
 * Features:
 * - Auto-generate form fields from metadata
 * - UIType-aware input components
 * - Field validation (email format, number ranges, required fields)
 * - Loading states during save
 * - Success/error feedback
 * - Keyboard navigation (Tab, Enter to save, Esc to cancel)
 */

import { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import { apiClient } from '../utils/api-client.js'
import type { UIType, FieldFormat } from '../renderers/index.js'

/**
 * Field definition for editing
 */
export interface EditField {
  /** Field key in the data object */
  key: string
  /** Display label */
  label: string
  /** UIType for rendering appropriate input */
  uiType?: UIType
  /** Format options */
  format?: FieldFormat
  /** Whether field is required */
  required?: boolean
  /** Whether field is read-only */
  readOnly?: boolean
  /** Available choices for select fields */
  choices?: string[]
}

/**
 * EditModal props
 */
export interface EditModalProps {
  /** Current record data */
  data: Record<string, unknown>
  /** Field definitions */
  fields: EditField[]
  /** Entity name (for API endpoint) */
  entityName: string
  /** Record ID */
  recordId: string
  /** Callback when edit is successful */
  onSuccess?: (updatedData: Record<string, unknown>) => void
  /** Callback when modal is closed */
  onClose?: () => void
}

/**
 * Validation result
 */
interface ValidationError {
  field: string
  message: string
}

/**
 * EditModal component
 */
export default function EditModal({
  data,
  fields,
  entityName,
  recordId,
  onSuccess,
  onClose,
}: EditModalProps) {
  // Filter out read-only and metadata fields
  const editableFields = fields.filter(
    (f) =>
      !f.readOnly &&
      f.key !== 'id' &&
      f.key !== 'created_at' &&
      f.key !== 'updated_at' &&
      f.key !== 'created_by' &&
      f.key !== 'updated_by'
  )

  // Form state - initialize with current values
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const field of editableFields) {
      initial[field.key] = data[field.key] ?? ''
    }
    return initial
  })

  const [currentFieldIndex, setCurrentFieldIndex] = useState(0)
  const [editingValue, setEditingValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Initialize editing value when changing fields
  useEffect(() => {
    const currentField = editableFields[currentFieldIndex]
    if (!isEditing && currentField) {
      const value = formData[currentField.key]
      setEditingValue(formatValueForEdit(value, currentField.uiType))
    }
  }, [currentFieldIndex, isEditing, editableFields, formData])

  /**
   * Validate form data
   */
  const validateForm = (): ValidationError[] => {
    const validationErrors: ValidationError[] = []

    for (const field of editableFields) {
      const value = formData[field.key]

      // Required field check
      if (field.required && (value === '' || value === null || value === undefined)) {
        validationErrors.push({
          field: field.key,
          message: `${field.label} is required`,
        })
        continue
      }

      // Skip validation for empty optional fields
      if (!value) continue

      // Type-specific validation
      const stringValue = String(value)

      switch (field.uiType) {
        case 'email':
          if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(stringValue)) {
            validationErrors.push({
              field: field.key,
              message: 'Invalid email format',
            })
          }
          break

        case 'url':
          try {
            new URL(stringValue)
          } catch {
            validationErrors.push({
              field: field.key,
              message: 'Invalid URL format',
            })
          }
          break

        case 'number':
        case 'money':
        case 'percent':
          if (isNaN(Number(value))) {
            validationErrors.push({
              field: field.key,
              message: 'Must be a valid number',
            })
          }
          break

        case 'date':
          if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
            validationErrors.push({
              field: field.key,
              message: 'Date must be in YYYY-MM-DD format',
            })
          }
          break

        case 'datetime':
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stringValue)) {
            validationErrors.push({
              field: field.key,
              message: 'DateTime must be in ISO format',
            })
          }
          break
      }
    }

    return validationErrors
  }

  /**
   * Handle save
   */
  const handleSave = async () => {
    // Validate
    const validationErrors = validateForm()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setIsSaving(true)
    setSaveStatus('idle')

    try {
      // Prepare data for API (convert types as needed)
      const apiData: Record<string, unknown> = {}
      for (const field of editableFields) {
        const value = formData[field.key]
        apiData[field.key] = convertValueForApi(value, field.uiType)
      }

      // Send PATCH request
      const updatedData = await apiClient.patch<Record<string, unknown>>(
        `/${entityName}/${recordId}`,
        apiData
      )

      setIsSaving(false)
      setSaveStatus('success')

      // Call success callback after short delay to show success message
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(updatedData)
        }
        if (onClose) {
          onClose()
        }
      }, 800)
    } catch (err) {
      setIsSaving(false)
      setSaveStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes')
    }
  }

  /**
   * Handle keyboard input
   */
  useInput((input, key) => {
    // Escape - close modal
    if (key.escape) {
      if (isEditing) {
        // Cancel editing current field
        setIsEditing(false)
        const currentField = editableFields[currentFieldIndex]
        setEditingValue(formatValueForEdit(formData[currentField.key], currentField.uiType))
      } else {
        // Close modal
        if (onClose) {
          onClose()
        }
      }
      return
    }

    // Don't handle other keys while saving
    if (isSaving || saveStatus === 'success') {
      return
    }

    // Enter - save form (if not editing) or finish editing field
    if (key.return) {
      if (isEditing) {
        // Save current field value
        const currentField = editableFields[currentFieldIndex]
        if (currentField) {
          setFormData({
            ...formData,
            [currentField.key]: editingValue,
          })
          setIsEditing(false)
        }
      } else {
        // Save entire form
        handleSave()
      }
      return
    }

    // Tab / Down arrow - next field (if not editing)
    if (!isEditing && (key.tab || key.downArrow)) {
      setCurrentFieldIndex((currentFieldIndex + 1) % editableFields.length)
      return
    }

    // Up arrow - previous field (if not editing)
    if (!isEditing && key.upArrow) {
      setCurrentFieldIndex((currentFieldIndex - 1 + editableFields.length) % editableFields.length)
      return
    }

    // Space or any letter - start editing current field
    if (!isEditing && (input === ' ' || /^[a-zA-Z0-9]$/.test(input))) {
      setIsEditing(true)
      setEditingValue(input === ' ' ? editingValue : input)
      return
    }

    // Handle text input while editing
    if (isEditing) {
      if (key.backspace || key.delete) {
        setEditingValue(editingValue.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setEditingValue(editingValue + input)
      }
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      width="80%"
      alignSelf="center"
    >
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Edit {entityName}
        </Text>
      </Box>

      {/* Form fields */}
      <Box flexDirection="column" marginBottom={1}>
        {editableFields.map((field, index) => {
          const value = formData[field.key]
          const isCurrent = index === currentFieldIndex
          const error = errors.find((e) => e.field === field.key)

          return (
            <Box key={field.key} flexDirection="column" marginBottom={0}>
              <Box>
                {/* Cursor indicator */}
                <Text>{isCurrent ? '>' : ' '} </Text>

                {/* Label */}
                <Text bold={isCurrent} dimColor={!isCurrent}>
                  {field.label}:{' '}
                </Text>

                {/* Value or input */}
                {isCurrent && isEditing ? (
                  <Text color="yellow">{editingValue}_</Text>
                ) : (
                  <Text color={isCurrent ? 'cyan' : undefined}>
                    {renderFieldValue(value, field.uiType)}
                  </Text>
                )}

                {/* Required indicator */}
                {field.required && <Text color="red"> *</Text>}
              </Box>

              {/* Field error */}
              {error && (
                <Box marginLeft={2}>
                  <Text color="red">⚠ {error.message}</Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      {/* Status messages */}
      {isSaving && (
        <Box marginBottom={1}>
          <Text color="cyan">Saving changes...</Text>
        </Box>
      )}

      {saveStatus === 'success' && (
        <Box marginBottom={1}>
          <Text color="green">✓ Changes saved successfully!</Text>
        </Box>
      )}

      {saveStatus === 'error' && (
        <Box marginBottom={1}>
          <Text color="red">✗ Error: {errorMessage}</Text>
        </Box>
      )}

      {/* Footer - Instructions */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          {isEditing
            ? 'Type to edit  •  Enter: Save field  •  Esc: Cancel'
            : '↑/↓: Navigate  •  Type: Edit  •  Enter: Save All  •  Esc: Close'}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Format value for editing (convert to string for input)
 */
function formatValueForEdit(value: unknown, uiType?: UIType): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * Convert value from string to appropriate type for API
 */
function convertValueForApi(value: unknown, uiType?: UIType): unknown {
  const stringValue = String(value)

  if (stringValue === '') return null

  switch (uiType) {
    case 'number':
    case 'money':
    case 'percent':
      return Number(stringValue)

    case 'boolean':
      return stringValue.toLowerCase() === 'true' || stringValue === '1'

    case 'json':
      try {
        return JSON.parse(stringValue)
      } catch {
        return stringValue
      }

    default:
      return stringValue
  }
}

/**
 * Render field value for display
 */
function renderFieldValue(value: unknown, uiType?: UIType): string {
  if (value === null || value === undefined || value === '') {
    return chalk.dim('(empty)')
  }

  // Boolean display
  if (uiType === 'boolean') {
    return value ? chalk.green('✓ true') : chalk.red('✗ false')
  }

  // Truncate long values
  const stringValue = String(value)
  if (stringValue.length > 50) {
    return stringValue.slice(0, 47) + '...'
  }

  return stringValue
}
