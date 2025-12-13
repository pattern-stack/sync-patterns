# Python Rewrite Roadmap

This document outlines a potential path to rewrite sync-patterns from TypeScript to Python, enabling tighter integration with the Pattern Stack tooling ecosystem.

## Motivation

### Current State (TypeScript)

sync-patterns is a Node.js CLI that:
- Parses OpenAPI specs
- Generates TypeScript code (Zod schemas, React Query hooks, API clients)
- Provides a TUI for exploring entities

### Why Consider Python?

1. **Single Tooling Ecosystem**: pts CLI (Python/Typer) is the central orchestrator for Pattern Stack. Having sync-patterns as a Python library means no Node.js dependency for developers.

2. **Native Integration**: Instead of shelling out to `npx sync-patterns`, pts could `from sync_patterns import generate` directly.

3. **Better OpenAPI Tooling**: Python has excellent OpenAPI libraries (`openapi-pydantic`, `prance`, `datamodel-codegen`) with strong typing.

4. **Jinja2 Templates**: More flexible and powerful than string interpolation. Template inheritance, macros, filters.

5. **Backend Alignment**: Pattern Stack backends are Python. Code generation tooling in the same language enables shared utilities.

### The Key Insight

> **The type safety that matters is in the output, not the generator.**

A Python script using Jinja2 can generate perfectly type-safe TypeScript. The generator doesn't need to be in the same language as what it produces.

## Architecture Overview

### Current TypeScript Structure

```
sync-patterns/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── generate.ts      # Generate command
│   │   │   ├── explore.ts       # TUI command
│   │   │   ├── login.ts         # Auth command
│   │   │   └── schema-check.ts  # Drift detection
│   │   └── utils/
│   │       └── auth-config.ts   # Token storage
│   ├── core/
│   │   └── entity-resolver.ts   # OpenAPI → EntityModel
│   ├── generators/
│   │   ├── parser.ts            # OpenAPI loading
│   │   ├── zod-generator.ts     # Zod schemas
│   │   ├── client-generator.ts  # API client
│   │   └── hook-generator.ts    # React Query hooks
│   └── tui/
│       └── App.tsx              # Ink TUI
```

### Proposed Python Structure

```
sync_patterns/
├── __init__.py
├── cli.py                       # Typer CLI (or integrate into pts)
├── parser.py                    # OpenAPI loading and entity resolution
├── models.py                    # Pydantic models for EntityModel, etc.
├── generator.py                 # Main generation orchestrator
├── templates/
│   ├── schemas/
│   │   └── entity.schema.ts.j2
│   ├── api/
│   │   └── entity.api.ts.j2
│   ├── hooks/
│   │   └── entity.hooks.ts.j2
│   ├── collections/
│   │   └── entity.collection.ts.j2
│   ├── entities/
│   │   └── entity.wrapper.ts.j2
│   └── index.ts.j2
└── tui/                         # Optional: Textual TUI
    └── app.py
```

## Implementation Plan

### Phase 1: Core Library (Est. 1-2 days)

Port the core generation logic without CLI.

#### 1.1 Models (`models.py`)

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

class SyncMode(Enum):
    API = "api"
    REALTIME = "realtime"
    OFFLINE = "offline"

@dataclass
class EntityOperation:
    """Represents a CRUD operation on an entity."""
    operation_id: str
    method: str  # GET, POST, PUT, DELETE
    path: str
    operation_type: str  # list, get, create, update, delete, custom
    request_schema: dict[str, Any] | None = None
    response_schema: dict[str, Any] | None = None
    path_params: list[str] = field(default_factory=list)
    query_params: list[str] = field(default_factory=list)
    requires_auth: bool = False

@dataclass
class Entity:
    """Represents a parsed API entity."""
    name: str
    plural_name: str
    sync_mode: SyncMode
    operations: list[EntityOperation] = field(default_factory=list)
    schema: dict[str, Any] | None = None
    id_field: str = "id"
    id_type: str = "string"

@dataclass
class EntityModel:
    """Complete model of all entities from an OpenAPI spec."""
    entities: list[Entity]
    schemas: dict[str, Any]
    auth_config: dict[str, Any] | None = None
```

#### 1.2 Parser (`parser.py`)

```python
from pathlib import Path
from typing import Any
import httpx
import yaml
from pydantic import BaseModel

from sync_patterns.models import Entity, EntityModel, EntityOperation, SyncMode

def load_openapi_spec(source: str) -> dict[str, Any]:
    """Load OpenAPI spec from URL, file, or JSON string."""
    if source.startswith(("http://", "https://")):
        response = httpx.get(source)
        response.raise_for_status()
        return response.json()

    path = Path(source)
    if path.exists():
        content = path.read_text()
        if path.suffix in (".yaml", ".yml"):
            return yaml.safe_load(content)
        return json.loads(content)

    # Try parsing as JSON string
    return json.loads(source)

def resolve_entities(spec: dict[str, Any]) -> EntityModel:
    """Extract entities from OpenAPI spec."""
    entities = []

    for path, path_item in spec.get("paths", {}).items():
        # Skip system paths
        if path in ("/health", "/ready", "/docs", "/openapi.json"):
            continue

        # Extract entity name from path or tags
        entity_name = _extract_entity_name(path, path_item)

        # Get or create entity
        entity = _find_or_create_entity(entities, entity_name)

        # Process operations
        for method in ("get", "post", "put", "patch", "delete"):
            if operation := path_item.get(method):
                entity.operations.append(
                    _parse_operation(path, method, operation)
                )

        # Extract sync mode
        entity.sync_mode = _extract_sync_mode(path_item)

    return EntityModel(
        entities=entities,
        schemas=spec.get("components", {}).get("schemas", {}),
    )

def _extract_sync_mode(path_item: dict) -> SyncMode:
    """Extract sync mode from x-sync extensions."""
    # New format: x-sync-mode
    if mode := path_item.get("x-sync-mode"):
        return SyncMode(mode)

    # Object format: x-sync.mode
    if x_sync := path_item.get("x-sync"):
        if mode := x_sync.get("mode"):
            return SyncMode(mode)
        # Legacy: local_first boolean
        if x_sync.get("local_first"):
            return SyncMode.REALTIME

    return SyncMode.API
```

#### 1.3 Generator (`generator.py`)

```python
from pathlib import Path
from jinja2 import Environment, PackageLoader, select_autoescape

from sync_patterns.models import EntityModel
from sync_patterns.parser import load_openapi_spec, resolve_entities

def generate(
    source: str,
    output_dir: Path,
    *,
    api_url: str | None = None,
    dry_run: bool = False,
) -> None:
    """Generate TypeScript code from OpenAPI spec."""
    # Load and parse
    spec = load_openapi_spec(source)
    model = resolve_entities(spec)

    # Setup Jinja2
    env = Environment(
        loader=PackageLoader("sync_patterns", "templates"),
        autoescape=select_autoescape(),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    # Add custom filters
    env.filters["camel_case"] = to_camel_case
    env.filters["pascal_case"] = to_pascal_case
    env.filters["zod_type"] = openapi_to_zod_type

    # Generate each component
    for entity in model.entities:
        _generate_entity(env, entity, output_dir, dry_run)

    # Generate index files
    _generate_index(env, model, output_dir, dry_run)

def _generate_entity(
    env: Environment,
    entity: Entity,
    output_dir: Path,
    dry_run: bool,
) -> None:
    """Generate all files for a single entity."""
    context = {"entity": entity}

    templates = [
        ("schemas/entity.schema.ts.j2", f"schemas/{entity.name}.schema.ts"),
        ("api/entity.api.ts.j2", f"api/{entity.name}.ts"),
        ("hooks/entity.hooks.ts.j2", f"hooks/{entity.name}.ts"),
    ]

    # Add collections for realtime/offline entities
    if entity.sync_mode in (SyncMode.REALTIME, SyncMode.OFFLINE):
        templates.append(
            ("collections/entity.collection.ts.j2", f"collections/{entity.name}.ts")
        )

    # Always add entity wrapper
    templates.append(
        ("entities/entity.wrapper.ts.j2", f"entities/{entity.name}.ts")
    )

    for template_name, output_path in templates:
        template = env.get_template(template_name)
        content = template.render(**context)

        if dry_run:
            print(f"Would write: {output_dir / output_path}")
        else:
            (output_dir / output_path).parent.mkdir(parents=True, exist_ok=True)
            (output_dir / output_path).write_text(content)
```

### Phase 2: Templates (Est. 1 day)

Convert TypeScript string templates to Jinja2.

#### Example: Zod Schema Template

```jinja2
{# templates/schemas/entity.schema.ts.j2 #}
/**
 * Zod schemas for {{ entity.name | pascal_case }}
 * @generated by sync-patterns
 */

import { z } from 'zod'

{% for prop_name, prop in entity.schema.properties.items() %}
{% if prop.description %}
/** {{ prop.description }} */
{% endif %}
{% endfor %}

export const {{ entity.name | pascal_case }}Schema = z.object({
{% for prop_name, prop in entity.schema.properties.items() %}
  {{ prop_name | camel_case }}: {{ prop | zod_type }}{% if prop_name not in entity.schema.required %}.optional(){% endif %},
{% endfor %}
})

export type {{ entity.name | pascal_case }} = z.infer<typeof {{ entity.name | pascal_case }}Schema>

export const {{ entity.name | pascal_case }}CreateSchema = {{ entity.name | pascal_case }}Schema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export type {{ entity.name | pascal_case }}Create = z.infer<typeof {{ entity.name | pascal_case }}CreateSchema>

export const {{ entity.name | pascal_case }}UpdateSchema = {{ entity.name | pascal_case }}CreateSchema.partial()

export type {{ entity.name | pascal_case }}Update = z.infer<typeof {{ entity.name | pascal_case }}UpdateSchema>
```

#### Example: React Query Hooks Template

```jinja2
{# templates/hooks/entity.hooks.ts.j2 #}
/**
 * React Query hooks for {{ entity.name | pascal_case }}
 * @generated by sync-patterns
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { {{ entity.name | pascal_case }}, {{ entity.name | pascal_case }}Create, {{ entity.name | pascal_case }}Update } from '../schemas/{{ entity.name }}.schema'
import { {{ entity.name }}Api } from '../api/{{ entity.name }}'

const QUERY_KEY = '{{ entity.plural_name }}'

{% if entity.has_list_operation %}
export function use{{ entity.plural_name | pascal_case }}(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: [QUERY_KEY, params],
    queryFn: () => {{ entity.name }}Api.list(params),
  })
}
{% endif %}

{% if entity.has_get_operation %}
export function use{{ entity.name | pascal_case }}(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => {{ entity.name }}Api.get(id),
    enabled: !!id,
  })
}
{% endif %}

{% if entity.has_create_operation %}
export function useCreate{{ entity.name | pascal_case }}() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {{ entity.name | pascal_case }}Create) => {{ entity.name }}Api.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}
{% endif %}

{% if entity.has_update_operation %}
export function useUpdate{{ entity.name | pascal_case }}() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: {{ entity.name | pascal_case }}Update }) =>
      {{ entity.name }}Api.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}
{% endif %}

{% if entity.has_delete_operation %}
export function useDelete{{ entity.name | pascal_case }}() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {{ entity.name }}Api.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}
{% endif %}
```

### Phase 3: CLI Integration (Est. 0.5 day)

Two options:

#### Option A: Standalone CLI (sync-patterns command)

```python
# sync_patterns/cli.py
import typer
from pathlib import Path
from sync_patterns.generator import generate

app = typer.Typer()

@app.command()
def generate_cmd(
    source: str,
    output: Path = Path("./src/generated"),
    api_url: str | None = None,
    dry_run: bool = False,
):
    """Generate TypeScript clients from OpenAPI spec."""
    generate(source, output, api_url=api_url, dry_run=dry_run)
```

#### Option B: Direct pts Integration (Recommended)

```python
# In pts/sync.py - replace subprocess calls with direct imports
from sync_patterns import generate, load_openapi_spec, resolve_entities

@sync_app.command("generate")
def sync_generate(...):
    sync_config = load_sync_config()
    generate(
        source=sync_config.openapi_url,
        output_dir=sync_config.output_dir,
        api_url=sync_config.api_url,
    )
```

### Phase 4: TUI (Optional, Est. 1-2 days)

Replace Ink (React for CLI) with Textual (Python TUI framework).

```python
# sync_patterns/tui/app.py
from textual.app import App, ComposeResult
from textual.widgets import DataTable, Header, Footer, Input
from textual.containers import Container

class EntityExplorer(App):
    """Interactive TUI for exploring API entities."""

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh", "Refresh"),
        ("/", "search", "Search"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        yield Container(
            Input(placeholder="Search...", id="search"),
            DataTable(id="entities"),
        )
        yield Footer()

    async def on_mount(self) -> None:
        table = self.query_one("#entities", DataTable)
        table.add_columns("ID", "Name", "Status", "Created")
        await self.load_entities()

    async def load_entities(self) -> None:
        # Fetch from API
        ...
```

## Migration Strategy

### Parallel Operation

During migration, both versions can coexist:

1. **TypeScript version**: `npx sync-patterns generate`
2. **Python version**: `pts sync generate` (calls Python directly)

### Gradual Migration

1. Start with parser and core models (Phase 1)
2. Port one template type at a time (Phase 2)
3. Test output equivalence with TypeScript version
4. Switch pts to use Python version (Phase 3)
5. Deprecate TypeScript version

### Validation

```python
# Test that Python output matches TypeScript output
def test_output_equivalence():
    ts_output = run_typescript_generator(spec)
    py_output = run_python_generator(spec)

    assert ts_output == py_output
```

## Effort Estimate

| Phase | Description | Effort |
|-------|-------------|--------|
| Phase 1 | Core library (models, parser, generator) | 1-2 days |
| Phase 2 | Jinja2 templates | 1 day |
| Phase 3 | CLI integration | 0.5 day |
| Phase 4 | TUI (optional) | 1-2 days |
| **Total** | | **3-5 days** |

## Decision Points

### Do Now (TypeScript)

- ✅ Finish TUI
- ✅ Complete entity wrapper generation
- ✅ Add offline mode support

### Consider for Python Rewrite

- When pts wrapper feels limiting
- When needing tighter backend integration
- When Node.js dependency becomes friction
- When adding features that benefit from Python ecosystem

## Appendix: Type Conversion Reference

### OpenAPI → Zod Type Mapping

```python
def openapi_to_zod_type(prop: dict) -> str:
    """Convert OpenAPI property to Zod type."""
    type_map = {
        "string": "z.string()",
        "integer": "z.number().int()",
        "number": "z.number()",
        "boolean": "z.boolean()",
        "array": lambda p: f"z.array({openapi_to_zod_type(p['items'])})",
        "object": "z.record(z.unknown())",
    }

    prop_type = prop.get("type", "string")

    # Handle format
    if prop_type == "string":
        format_map = {
            "uuid": "z.string().uuid()",
            "email": "z.string().email()",
            "uri": "z.string().url()",
            "date": "z.string().date()",
            "date-time": "z.string().datetime()",
        }
        if fmt := prop.get("format"):
            return format_map.get(fmt, "z.string()")

    # Handle enum
    if enum := prop.get("enum"):
        values = ", ".join(f'"{v}"' for v in enum)
        return f"z.enum([{values}])"

    # Handle $ref
    if ref := prop.get("$ref"):
        schema_name = ref.split("/")[-1]
        return f"{schema_name}Schema"

    mapper = type_map.get(prop_type, "z.unknown()")
    return mapper(prop) if callable(mapper) else mapper
```

### Naming Convention Filters

```python
import re

def to_camel_case(s: str) -> str:
    """Convert snake_case to camelCase."""
    components = s.split("_")
    return components[0] + "".join(x.title() for x in components[1:])

def to_pascal_case(s: str) -> str:
    """Convert snake_case to PascalCase."""
    return "".join(x.title() for x in s.split("_"))

def to_snake_case(s: str) -> str:
    """Convert camelCase/PascalCase to snake_case."""
    return re.sub(r'(?<!^)(?=[A-Z])', '_', s).lower()

def pluralize(s: str) -> str:
    """Simple English pluralization."""
    if s.endswith("y"):
        return s[:-1] + "ies"
    if s.endswith(("s", "x", "z", "ch", "sh")):
        return s + "es"
    return s + "s"
```
