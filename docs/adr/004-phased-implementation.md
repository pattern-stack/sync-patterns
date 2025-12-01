# ADR-004: Phased Implementation Strategy

## Status

**Accepted** (terminology updated 2025-12-01)

> **Note**: This ADR originally used `push`/`live`/`cache` terminology from ADR-002, which has been superseded. See [TERMINOLOGY.md](../TERMINOLOGY.md) for current terms.

## Date

2025-11-29

## Context

sync-patterns has dependencies on:
- **backend-patterns** - Must be stable enough to add sync annotations to models
- **frontend-patterns** - Must be stable enough to integrate generated hooks
- **Metrics layer** - Required for cached/computed results mode (doesn't exist yet)

Additionally, implementing all three sync modes simultaneously would be:
- High risk (too many moving parts)
- Slow to deliver value
- Difficult to learn from real usage

We need a phased approach that delivers value incrementally.

## Decision

### Phase 1: Confirmed and Optimistic modes

**Goal**: Enable basic sync functionality for CRUD operations

**Deliverables**:
1. CLI that reads OpenAPI spec with sync annotations
2. TypeScript type generation
3. Confirmed mode (`local_first: false`): TanStack Query hooks for direct API calls
4. Optimistic mode (`local_first: true`): TanStack DB + ElectricSQL integration
5. Unified entity wrappers that abstract the mode
6. Documentation and examples

**Prerequisites**:
- backend-patterns model annotation syntax defined
- frontend-patterns project structure established
- ElectricSQL service deployment strategy

**Success Criteria**:
- Can generate working hooks from annotated spec
- Confirmed mode works with existing API
- Optimistic mode syncs data between Postgres and client
- At least one real project using it

### Phase 2: Cached/Computed Results

**Goal**: Enable sync of pre-computed results from server cache

**Deliverables**:
1. Cached results generation (architecture TBD)
2. Integration with backend-patterns caching layer (Redis)
3. TTL and invalidation configuration
4. Metrics layer integration

**Prerequisites**:
- Phase 1 complete and stable
- Metrics layer defined in backend-patterns
- Cache invalidation strategy determined

**Success Criteria**:
- Computed results sync to frontend local store
- TTL-based refresh works
- Event-driven invalidation works (stretch)

### Phase 3: Advanced Features (Future)

**Potential scope** (not committed):
- Custom conflict resolution strategies
- Partial/filtered sync (sync subsets of data)
- Cross-platform clients (SwiftUI, Kotlin)
- Batched sync modes
- Offline-first enhancements

### Timeline Philosophy

We explicitly do not commit to timelines. Each phase is complete when:
1. Deliverables are done
2. Success criteria are met
3. Dependencies are satisfied

## Consequences

### Positive

- **Reduced risk**: Smaller, focused phases
- **Faster time to value**: Phase 1 is useful on its own
- **Learning opportunity**: Real usage informs later phases
- **Clear scope**: Each phase has defined deliverables

### Negative

- **Cache mode delayed**: Teams wanting computed result sync must wait
- **Phase dependencies**: Can't parallelize all work

### Neutral

- Phase 3 is intentionally vague; will be defined based on learnings
- Phases may be adjusted as we learn

## Alternatives Considered

### Big bang release
- All features at once
- Higher risk, longer wait for any value
- Harder to course-correct

### Start with cached/computed mode
- Addresses immediate client need (metrics)
- More complex, requires metrics layer first
- Confirmed/optimistic modes are more foundational

## References

- [ADR-001: Sync Stack Selection](001-sync-stack-selection.md)
- [ADR-002: Sync Modes Definition](002-sync-modes.md)
- [ADR-003: Default Behaviors](003-default-behaviors.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial decision | Planning session |
