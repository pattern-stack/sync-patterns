# SPEC: Backend-Patterns Integration for sync-patterns

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-001 |
| **Title** | Backend-Patterns Sync & RBAC Metadata Integration |
| **Status** | Draft |
| **Created** | 2025-11-29 |
| **Phase** | 1 (Metadata Foundation) |

---

## Executive Summary

This specification defines how backend-patterns models declare sync behavior and RBAC metadata for consumption by sync-patterns CLI. Phase 1 implements the metadata infrastructure without enforcement—models can be fully annotated, and sync-patterns can generate appropriate client code, while actual RBAC enforcement is deferred to Phase 2.

### Goals

1. Enable models to declare `local_first` sync behavior
2. Enable fields to declare `sync_exclude` for local-only data
3. Establish RBAC metadata hooks (`field_groups`, `role_permissions`, `owner_only`)
4. Expose all metadata via OpenAPI `x-*` extensions
5. Maintain backward compatibility (all new config is optional)

### Non-Goals (Phase 1)

- RBAC enforcement logic
- Role column in database join tables
- `_role` field in API responses
- Client-side permission checking
- Permission-aware UI generation

---

## Background

### The Problem

sync-patterns generates typed clients from OpenAPI specs. To generate appropriate code, it needs to know:

1. **Sync behavior**: Should mutations be optimistic (local-first) or wait for server confirmation?
2. **Sync scope**: Which fields should sync vs. stay local?
3. **Permissions**: What RBAC structure exists for future permission-aware generation?

Currently, none of this information exists in backend-patterns models or the generated OpenAPI spec.

### Current Authorization Model

```
If you can see it, you can use it.
```

- Access is binary via household/tenant scoping
- No edit vs. view distinction per row
- API facade checks access at request time
- OpenAPI spec has no permission information

### Local-First Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │   UI     │◄──►│  TanStack DB │◄──►│  Local SQLite         │ │
│  │          │    │  (reactive)  │    │  (source of change)   │ │
│  └──────────┘    └──────────────┘    └───────────────────────┘ │
│                                              │                  │
│                                              │ sync             │
└──────────────────────────────────────────────│──────────────────┘
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                  │
│  ┌──────────────┐    ┌───────────────────────┐                 │
│  │  ElectricSQL │◄──►│  Postgres             │                 │
│  │  (sync)      │    │  (source of truth)    │                 │
│  └──────────────┘    └───────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**Two write modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `local_first = True` | Write to local DB, sync later, UI instant | User data, collaborative editing |
| `local_first = False` | Write to local DB, wait for server confirmation | Financial, permission-sensitive |

---

## Detailed Design

### 1. Pattern Configuration Additions

#### 1.1 Sync Configuration

Add to `class Pattern:` inner class:

```python
class Contact(ActorPattern):
    __tablename__ = "contacts"

    class Pattern:
        entity = "contact"
        reference_prefix = "CONT"

        # === EXISTING ===
        track_changes = True
        change_retention = "730d"

        # === NEW: Sync Configuration ===
        local_first: bool = True  # Default: False (safe)
```

**Validation rules:**
- `local_first` must be `bool`
- Default is `False` (confirmed writes, safe default)

#### 1.2 RBAC Metadata (Not Enforced)

```python
class Account(ActorPattern):
    __tablename__ = "accounts"

    class Pattern:
        entity = "account"

        # === NEW: RBAC Metadata ===
        field_groups: ClassVar[dict[str, list[str]]] = {
            "basic": ["name", "description"],
            "financial": ["credit_limit", "balance"],
            "audit": ["approved_by", "approved_at"],
        }

        role_permissions: ClassVar[dict[str, list[str]]] = {
            "viewer": [],                           # Read only
            "editor": ["basic"],                    # Edit basic fields
            "owner": ["basic", "financial", "audit"],  # Edit all
        }
```

**Validation rules:**
- `field_groups` must be `dict[str, list[str]]`
- `role_permissions` must be `dict[str, list[str]]`
- `role_permissions` values must reference keys from `field_groups`
- Field names in `field_groups` should exist on model (warning, not error)

---

### 2. Field Additions

#### 2.1 Sync Exclusion

```python
class Contact(ActorPattern):
    # Synced fields (default)
    first_name: str = Field(str, required=True)
    email: str = Field(str, unique=True)

    # === NEW: Local-only field ===
    local_notes: str = Field(str, sync_exclude=True)
    draft_content: str = Field(str, sync_exclude=True)
```

**Behavior:**
- `sync_exclude=True` fields are stored in local SQLite only
- Not sent to server during sync
- Not included in sync-patterns generated sync schemas
- Still included in regular API schemas (for server-rendered views)

#### 2.2 Owner-Only Marker

```python
class Account(ActorPattern):
    # Standard fields
    name: str = Field(str, required=True)

    # === NEW: Owner-only fields ===
    credit_limit: Decimal = Field(Decimal, owner_only=True)
    approved_by: UUID = Field(UUID, owner_only=True)
```

**Behavior (Phase 1):**
- Stored as metadata in `Column.info`
- Exposed in OpenAPI schema as `x-owner-only: true`
- **NOT enforced** - just metadata for future use

**Behavior (Phase 2 - Future):**
- Client checks `_role` against `owner_only` to show/hide edit controls
- Server validates role before allowing writes to these fields

---

### 3. Implementation Details

#### 3.1 Field Class Changes

**File:** `pattern_stack/atoms/patterns/fields.py`

```python
class Field:
    def __init__(
        self,
        field_type: type[Any],
        *,
        # ... existing parameters ...

        # === NEW: Sync configuration ===
        sync_exclude: bool = False,

        # === NEW: RBAC metadata (not enforced) ===
        owner_only: bool = False,
    ):
        # ... existing code ...
        self.sync_exclude = sync_exclude
        self.owner_only = owner_only

    def to_column(self, name: str) -> Column[Any]:
        # ... existing code ...

        # Build info dict for metadata
        info: dict[str, Any] = {}

        # Existing UI metadata
        if ui_metadata:
            info["ui"] = ui_metadata

        # === NEW: Sync metadata ===
        if self.sync_exclude:
            info["sync"] = {"exclude": True}

        # === NEW: RBAC metadata ===
        if self.owner_only:
            info["rbac"] = {"owner_only": True}

        if info:
            column_kwargs["info"] = info

        return Column(*column_args, **column_kwargs)
```

#### 3.2 BasePattern Validation Changes

**File:** `pattern_stack/atoms/patterns/base.py`

Add to `_validate_pattern_config()`:

```python
@classmethod
def _validate_pattern_config(cls) -> None:
    # ... existing validation ...

    # === NEW: Validate local_first ===
    if hasattr(pattern_config, "local_first"):
        if not isinstance(pattern_config.local_first, bool):
            raise ValueError(
                f"Pattern.local_first must be bool, got {type(pattern_config.local_first).__name__}"
            )

    # === NEW: Validate field_groups ===
    if hasattr(pattern_config, "field_groups"):
        field_groups = pattern_config.field_groups
        if not isinstance(field_groups, dict):
            raise ValueError("Pattern.field_groups must be dict[str, list[str]]")

        for group_name, fields in field_groups.items():
            if not isinstance(fields, (list, tuple)):
                raise ValueError(f"Pattern.field_groups['{group_name}'] must be a list")
            for field_name in fields:
                if not isinstance(field_name, str):
                    raise ValueError(f"Field names in field_groups must be strings")

        # Warn about unknown fields (don't error - fields might be inherited)
        if hasattr(cls, "__table__"):
            known_fields = set(cls.__table__.columns.keys())
            for group_name, fields in field_groups.items():
                for field_name in fields:
                    if field_name not in known_fields:
                        logger.warning(
                            f"Pattern.field_groups references unknown field '{field_name}' "
                            f"in group '{group_name}' for {cls.__name__}"
                        )

    # === NEW: Validate role_permissions ===
    if hasattr(pattern_config, "role_permissions"):
        role_permissions = pattern_config.role_permissions
        if not isinstance(role_permissions, dict):
            raise ValueError("Pattern.role_permissions must be dict[str, list[str]]")

        # Validate references to field_groups
        field_groups = getattr(pattern_config, "field_groups", {})
        for role, groups in role_permissions.items():
            if not isinstance(groups, (list, tuple)):
                raise ValueError(f"Pattern.role_permissions['{role}'] must be a list")
            for group in groups:
                if group not in field_groups:
                    raise ValueError(
                        f"Pattern.role_permissions['{role}'] references unknown "
                        f"field_group '{group}'. Available: {list(field_groups.keys())}"
                    )
```

#### 3.3 Custom OpenAPI Schema Hook

**File:** `pattern_stack/atoms/app/openapi.py` (NEW)

```python
"""Custom OpenAPI schema generation with sync and RBAC extensions."""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from pattern_stack.atoms.patterns.base import BasePattern


def get_sync_openapi_schema(app: FastAPI) -> dict[str, Any]:
    """Generate OpenAPI schema with x-sync and x-rbac extensions.

    Injects custom extensions into the OpenAPI schema based on
    Pattern configuration and Field metadata.
    """
    if app.openapi_schema:
        return app.openapi_schema

    # Generate base schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    # Inject x-sync into paths based on registered patterns
    _inject_path_extensions(openapi_schema)

    # Inject x-sync-exclude and x-owner-only into schema properties
    _inject_schema_extensions(openapi_schema)

    app.openapi_schema = openapi_schema
    return app.openapi_schema


def _inject_path_extensions(schema: dict[str, Any]) -> None:
    """Inject x-sync and x-rbac extensions into path items."""
    paths = schema.get("paths", {})

    for path, path_item in paths.items():
        # Determine model class from path (convention-based)
        model_class = _get_model_for_path(path)
        if not model_class:
            continue

        pattern_config = getattr(model_class, "Pattern", None)
        if not pattern_config:
            continue

        # Inject x-sync
        local_first = getattr(pattern_config, "local_first", False)
        path_item["x-sync"] = {
            "local_first": local_first,
        }

        # Inject x-rbac if configured
        field_groups = getattr(pattern_config, "field_groups", None)
        role_permissions = getattr(pattern_config, "role_permissions", None)

        if field_groups or role_permissions:
            path_item["x-rbac"] = {}
            if field_groups:
                path_item["x-rbac"]["field_groups"] = field_groups
            if role_permissions:
                path_item["x-rbac"]["role_permissions"] = role_permissions


def _inject_schema_extensions(schema: dict[str, Any]) -> None:
    """Inject x-sync-exclude and x-owner-only into schema properties."""
    components = schema.get("components", {})
    schemas = components.get("schemas", {})

    for schema_name, schema_def in schemas.items():
        model_class = _get_model_for_schema(schema_name)
        if not model_class or not hasattr(model_class, "__table__"):
            continue

        properties = schema_def.get("properties", {})

        for column in model_class.__table__.columns:
            if column.name not in properties:
                continue

            col_info = column.info or {}

            # Inject x-sync-exclude
            sync_info = col_info.get("sync", {})
            if sync_info.get("exclude"):
                properties[column.name]["x-sync-exclude"] = True

            # Inject x-owner-only
            rbac_info = col_info.get("rbac", {})
            if rbac_info.get("owner_only"):
                properties[column.name]["x-owner-only"] = True


def _get_model_for_path(path: str) -> type[BasePattern] | None:
    """Get model class for a path using pattern registry.

    Uses convention: /contacts -> Contact, /accounts -> Account
    """
    # Extract resource name from path (e.g., "/api/contacts/{id}" -> "contacts")
    parts = path.strip("/").split("/")
    for part in parts:
        if part and not part.startswith("{"):
            # Try to find matching pattern
            resource = part.rstrip("s")  # contacts -> contact
            for name, cls in BasePattern._registry.items():
                pattern_config = getattr(cls, "Pattern", None)
                if pattern_config:
                    entity = getattr(pattern_config, "entity", "").lower()
                    if entity == resource:
                        return cls
    return None


def _get_model_for_schema(schema_name: str) -> type[BasePattern] | None:
    """Get model class for a schema name.

    Uses pattern registry to match schema names to models.
    """
    # Try direct match first
    if schema_name in BasePattern._registry:
        return BasePattern._registry[schema_name]

    # Try case-insensitive match
    for name, cls in BasePattern._registry.items():
        if name.lower() == schema_name.lower():
            return cls

    return None
```

**File:** `pattern_stack/atoms/app/factory.py` (MODIFY)

```python
from pattern_stack.atoms.app.openapi import get_sync_openapi_schema

def create_app(...) -> FastAPI:
    # ... existing code ...

    # === NEW: Custom OpenAPI with sync extensions ===
    app.openapi = lambda: get_sync_openapi_schema(app)

    return app
```

---

### 4. OpenAPI Output

#### 4.1 Path-Level Extensions

```yaml
paths:
  /api/contacts:
    x-sync:
      local_first: true
    x-rbac:
      field_groups:
        basic:
          - first_name
          - last_name
          - email
        sensitive:
          - ssn
          - date_of_birth
      role_permissions:
        viewer: []
        editor:
          - basic
        owner:
          - basic
          - sensitive
    get:
      # ... standard OpenAPI ...
    post:
      # ...
```

#### 4.2 Schema-Level Extensions

```yaml
components:
  schemas:
    Contact:
      type: object
      properties:
        first_name:
          type: string
        email:
          type: string
        local_notes:
          type: string
          x-sync-exclude: true
        credit_limit:
          type: number
          x-owner-only: true
        approved_by:
          type: string
          format: uuid
          x-owner-only: true
```

---

### 5. Configuration Defaults

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `local_first` | Pattern | `False` | Wait for server confirmation (safe) |
| `field_groups` | Pattern | `{}` | No grouping |
| `role_permissions` | Pattern | `{}` | No RBAC (if visible, editable) |
| `sync_exclude` | Field | `False` | Field is synced |
| `owner_only` | Field | `False` | Any editor can modify |

---

### 6. Directory Structure

```
pattern_stack/atoms/
├── app/
│   ├── factory.py      # MODIFY: Add openapi hook
│   └── openapi.py      # NEW: Custom OpenAPI generation
├── patterns/
│   ├── base.py         # MODIFY: Add validation
│   └── fields.py       # MODIFY: Add parameters
└── sync/               # NEW: Sync utilities (optional)
    ├── __init__.py
    └── types.py        # Type definitions for sync config
```

---

### 7. Testing Strategy

#### 7.1 Unit Tests

```python
# test_field_sync_metadata.py

def test_field_sync_exclude_stored_in_column_info():
    """sync_exclude=True should appear in Column.info"""
    field = Field(str, sync_exclude=True)
    column = field.to_column("notes")
    assert column.info.get("sync", {}).get("exclude") is True


def test_field_owner_only_stored_in_column_info():
    """owner_only=True should appear in Column.info"""
    field = Field(Decimal, owner_only=True)
    column = field.to_column("credit_limit")
    assert column.info.get("rbac", {}).get("owner_only") is True


def test_field_defaults_no_sync_metadata():
    """Default field should have no sync/rbac metadata"""
    field = Field(str)
    column = field.to_column("name")
    assert "sync" not in column.info
    assert "rbac" not in column.info
```

```python
# test_pattern_config_validation.py

def test_local_first_must_be_bool():
    """local_first must be boolean"""
    with pytest.raises(ValueError, match="must be bool"):
        class Bad(BasePattern):
            __tablename__ = "bad"
            class Pattern:
                entity = "bad"
                local_first = "yes"  # Wrong type


def test_field_groups_validates_structure():
    """field_groups must be dict[str, list[str]]"""
    with pytest.raises(ValueError):
        class Bad(BasePattern):
            __tablename__ = "bad"
            class Pattern:
                entity = "bad"
                field_groups = ["not", "a", "dict"]


def test_role_permissions_references_valid_groups():
    """role_permissions must reference existing field_groups"""
    with pytest.raises(ValueError, match="unknown field_group"):
        class Bad(BasePattern):
            __tablename__ = "bad"
            class Pattern:
                entity = "bad"
                field_groups = {"basic": ["name"]}
                role_permissions = {"editor": ["nonexistent"]}
```

```python
# test_openapi_extensions.py

def test_openapi_includes_x_sync():
    """OpenAPI schema should include x-sync on paths"""
    app = create_test_app_with_contact_model()
    schema = app.openapi()

    contact_path = schema["paths"].get("/api/contacts")
    assert contact_path is not None
    assert "x-sync" in contact_path
    assert contact_path["x-sync"]["local_first"] is True


def test_openapi_includes_x_sync_exclude():
    """OpenAPI schema should include x-sync-exclude on properties"""
    app = create_test_app_with_contact_model()
    schema = app.openapi()

    contact_schema = schema["components"]["schemas"]["Contact"]
    assert contact_schema["properties"]["local_notes"]["x-sync-exclude"] is True
```

#### 7.2 Integration Tests

```python
# test_full_model_definition.py

def test_complete_model_with_sync_and_rbac():
    """Full model definition with all new features"""

    class Contact(ActorPattern):
        __tablename__ = "test_contacts"

        class Pattern:
            entity = "contact"
            local_first = True
            field_groups = {
                "basic": ["first_name", "last_name"],
                "financial": ["credit_limit"],
            }
            role_permissions = {
                "viewer": [],
                "editor": ["basic"],
                "owner": ["basic", "financial"],
            }

        first_name = Field(str, required=True)
        last_name = Field(str, required=True)
        credit_limit = Field(Decimal, owner_only=True)
        local_notes = Field(str, sync_exclude=True)

    # Verify Pattern config
    assert Contact.Pattern.local_first is True
    assert "basic" in Contact.Pattern.field_groups

    # Verify Field metadata in columns
    assert Contact.__table__.columns["local_notes"].info["sync"]["exclude"] is True
    assert Contact.__table__.columns["credit_limit"].info["rbac"]["owner_only"] is True
```

---

### 8. Migration Guide

#### For Existing Models

No migration required. All new configuration is optional with safe defaults:

```python
# Before (still works)
class Contact(ActorPattern):
    __tablename__ = "contacts"

    class Pattern:
        entity = "contact"

    name = Field(str, required=True)


# After (opt-in to new features)
class Contact(ActorPattern):
    __tablename__ = "contacts"

    class Pattern:
        entity = "contact"
        local_first = True  # NEW: opt-in

    name = Field(str, required=True)
    local_notes = Field(str, sync_exclude=True)  # NEW: opt-in
```

---

### 9. Documentation

#### 9.1 New Documentation File

**File:** `docs/SYNC_CONFIGURATION.md`

Contents:
- Overview of sync modes
- Pattern configuration reference
- Field configuration reference
- OpenAPI extensions reference
- Examples for common use cases
- Future RBAC enforcement notes

#### 9.2 Updates to Existing Docs

- `CLAUDE.md`: Add sync configuration to Pattern config list
- `FIELD_ABSTRACTION.md`: Add `sync_exclude` and `owner_only` parameters
- `CODEGEN_STANDARDS.md`: Add sync/RBAC config to model template

---

## Phase 2: RBAC Enforcement (Future)

> **Note:** This section documents the future direction. Implementation is deferred until RBAC requirements are concrete.

### What Phase 2 Adds

| Component | Description |
|-----------|-------------|
| Role column in join tables | `user_accounts.role` storing `'owner'`, `'editor'`, `'viewer'` |
| `_role` in responses | API responses include user's role for the entity |
| Server enforcement | API facade validates role before field writes |
| Client enforcement | UI hides controls based on `_role` and `owner_only` |
| `sync_role = True` | Pattern config to include `_role` in synced data |

### Database Schema Change

```sql
-- Add role to existing join tables
ALTER TABLE user_accounts
ADD COLUMN role VARCHAR(20) DEFAULT 'owner' NOT NULL;

-- Role values: 'owner', 'editor', 'viewer'
```

### API Response Change

```json
{
  "id": "account-123",
  "name": "Checking",
  "credit_limit": 5000.00,
  "_role": "editor"
}
```

### Client Behavior

```typescript
// Generated by sync-patterns
function canEditField(entity: Account, fieldName: string): boolean {
  const role = entity._role;
  const fieldMeta = AccountSchema.properties[fieldName];

  // Owner-only field check
  if (fieldMeta['x-owner-only'] && role !== 'owner') {
    return false;
  }

  // Field group check
  const editableGroups = rolePermissions[role] || [];
  for (const [groupName, fields] of Object.entries(fieldGroups)) {
    if (fields.includes(fieldName)) {
      return editableGroups.includes(groupName);
    }
  }

  return role !== 'viewer';
}
```

### Pattern Config Addition

```python
class Pattern:
    local_first = True
    sync_role = True  # Include _role in synced data

    field_groups = {...}
    role_permissions = {...}
```

---

## Appendix

### A. Complete Example Model

```python
from decimal import Decimal
from typing import Any, ClassVar
from uuid import UUID

from pattern_stack.atoms.patterns import ActorPattern
from pattern_stack.atoms.patterns.fields import Field


class Account(ActorPattern):
    """Financial account with sync and RBAC configuration.

    Demonstrates all Phase 1 sync-patterns integration features.
    """

    __tablename__ = "accounts"

    class Pattern:
        entity = "account"
        reference_prefix = "ACCT"

        # Existing config
        track_changes = True
        change_retention = "2555d"  # 7 years for financial
        field_defaults: ClassVar[dict[str, Any]] = {"actor_type": "account"}

        # === Sync Configuration ===
        local_first = True  # Optimistic writes

        # === RBAC Metadata (not enforced in Phase 1) ===
        field_groups: ClassVar[dict[str, list[str]]] = {
            "basic": ["name", "description", "account_type"],
            "financial": ["credit_limit", "overdraft_limit"],
            "audit": ["approved_by", "approved_at", "frozen_reason"],
        }

        role_permissions: ClassVar[dict[str, list[str]]] = {
            "viewer": [],                              # Read only
            "editor": ["basic"],                       # Edit basic info
            "owner": ["basic", "financial", "audit"],  # Full access
        }

    # Foreign key
    household_id: UUID = Field(
        UUID,
        foreign_key="households.id",
        required=True,
        index=True,
    )

    # Basic fields (editor can modify)
    name: str = Field(str, required=True, max_length=100)
    description: str = Field(str, max_length=500)
    account_type: str = Field(
        str,
        max_length=20,
        required=True,
        choices=["CHECKING", "SAVINGS", "CREDIT_CARD"],
    )

    # Financial fields (owner only)
    credit_limit: Decimal = Field(Decimal, owner_only=True)
    overdraft_limit: Decimal = Field(Decimal, owner_only=True)

    # Audit fields (owner only)
    approved_by: UUID = Field(UUID, owner_only=True)
    approved_at: datetime = Field(datetime, owner_only=True)
    frozen_reason: str = Field(str, owner_only=True)

    # Local-only fields (never synced)
    local_notes: str = Field(str, sync_exclude=True)
    ui_preferences: dict = Field(dict, default=dict, sync_exclude=True)
```

### B. Generated OpenAPI (Expected Output)

```yaml
openapi: 3.1.0
info:
  title: Pattern Stack API
  version: 1.0.0

paths:
  /api/accounts:
    x-sync:
      local_first: true
    x-rbac:
      field_groups:
        basic:
          - name
          - description
          - account_type
        financial:
          - credit_limit
          - overdraft_limit
        audit:
          - approved_by
          - approved_at
          - frozen_reason
      role_permissions:
        viewer: []
        editor:
          - basic
        owner:
          - basic
          - financial
          - audit
    get:
      summary: List accounts
      # ...
    post:
      summary: Create account
      # ...

  /api/accounts/{id}:
    x-sync:
      local_first: true
    x-rbac:
      # Same as above
    get:
      summary: Get account
      # ...
    patch:
      summary: Update account
      # ...

components:
  schemas:
    Account:
      type: object
      required:
        - name
        - account_type
        - household_id
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          maxLength: 100
        description:
          type: string
          maxLength: 500
        account_type:
          type: string
          enum:
            - CHECKING
            - SAVINGS
            - CREDIT_CARD
        credit_limit:
          type: number
          x-owner-only: true
        overdraft_limit:
          type: number
          x-owner-only: true
        approved_by:
          type: string
          format: uuid
          x-owner-only: true
        approved_at:
          type: string
          format: date-time
          x-owner-only: true
        frozen_reason:
          type: string
          x-owner-only: true
        local_notes:
          type: string
          x-sync-exclude: true
        ui_preferences:
          type: object
          x-sync-exclude: true
```

---

## Changelog

| Date | Change |
|------|--------|
| 2025-11-29 | Initial draft |
