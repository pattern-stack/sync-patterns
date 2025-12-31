/**
 * Relationship Detector
 *
 * Shared utility for detecting entity relationships from EntityModel.
 * Used by both CollectionGenerator and EntityHookGenerator.
 */

import type { EntityDefinition } from './entity-model.js'

/**
 * Relationship definition
 */
export interface Relationship {
  /** Relation name (e.g., 'customer', 'items') */
  name: string
  /** Relation type */
  type: 'belongsTo' | 'hasMany'
  /** Target entity name (plural, e.g., 'customers') */
  targetEntity: string
  /** Foreign key field name (e.g., 'customer_id', 'order_id') */
  foreignKey: string
}

/**
 * Detect relationships for an entity.
 *
 * Detection rules:
 * 1. belongsTo: Field ends with `_id` and has x-ui-reference to another entity
 * 2. hasMany: Another entity has a `_id` field pointing to this entity
 *
 * @param entity - The entity to detect relationships for
 * @param allEntities - Map of all entities in the model
 * @returns Array of detected relationships
 */
export function detectRelationships(
  entity: EntityDefinition,
  allEntities: Map<string, EntityDefinition>
): Relationship[] {
  const relationships: Relationship[] = []
  const columns = entity.columnMetadata || []

  // Detect belongsTo from _id fields with entity references
  for (const column of columns) {
    if (column.field.endsWith('_id') && column.type === 'entity' && column.reference) {
      const targetEntity = column.reference.entity
      const relationName = column.field.replace(/_id$/, '')

      // Only add if target entity exists in our model
      if (allEntities.has(targetEntity)) {
        relationships.push({
          name: relationName,
          type: 'belongsTo',
          targetEntity,
          foreignKey: column.field,
        })
      }
    }
  }

  // Detect hasMany from other entities' _id fields pointing here
  const singularName = entity.singular
  const fkField = `${singularName}_id`

  for (const [otherName, otherEntity] of allEntities) {
    if (otherName === entity.name) continue // Skip self

    const otherColumns = otherEntity.columnMetadata || []
    const hasFK = otherColumns.some(
      (col) =>
        col.field === fkField ||
        (col.reference && col.reference.entity === entity.name)
    )

    if (hasFK) {
      relationships.push({
        name: otherName,
        type: 'hasMany',
        targetEntity: otherName,
        foreignKey: fkField,
      })
    }
  }

  return relationships
}

/**
 * Build a relationship map for all entities.
 *
 * @param entities - Map of all entities
 * @returns Map of entity name to relationships
 */
export function buildRelationshipMap(
  entities: Map<string, EntityDefinition>
): Map<string, Relationship[]> {
  const relationshipMap = new Map<string, Relationship[]>()

  for (const [name, entity] of entities) {
    const relationships = detectRelationships(entity, entities)
    relationshipMap.set(name, relationships)
  }

  return relationshipMap
}
