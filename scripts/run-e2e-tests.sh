#!/bin/bash
# E2E test runner for SYNC-012 broadcast system
# This script starts the test infrastructure, runs frontend integration tests,
# and ensures proper cleanup regardless of test outcome.

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.test.yml"
TIMEOUT_SECONDS=60
TEST_EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function - always runs on exit
cleanup() {
    log_info "Cleaning up test infrastructure..."
    docker compose -f "$COMPOSE_FILE" --project-directory "$WORKSPACE_DIR" down --volumes --remove-orphans 2>/dev/null || true
    log_info "Cleanup complete"
}

# Set trap to ensure cleanup runs on exit
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Wait for a service to be healthy
wait_for_health() {
    local service=$1
    local url=$2
    local elapsed=0

    log_info "Waiting for $service to be healthy..."

    while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_info "$service is healthy"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        echo -n "."
    done

    echo ""
    log_error "$service did not become healthy within ${TIMEOUT_SECONDS}s"
    return 1
}

# Start test infrastructure
start_infrastructure() {
    log_info "Starting test infrastructure..."

    # Build and start services (project-directory sets build context to workspace root)
    docker compose -f "$COMPOSE_FILE" --project-directory "$WORKSPACE_DIR" up -d --build

    # Wait for Redis (via docker health check)
    log_info "Waiting for Redis health check..."
    local redis_healthy=false
    local elapsed=0
    while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
        if docker compose -f "$COMPOSE_FILE" --project-directory "$WORKSPACE_DIR" ps redis 2>/dev/null | grep -q "healthy"; then
            redis_healthy=true
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        echo -n "."
    done
    echo ""

    if [ "$redis_healthy" = false ]; then
        log_error "Redis did not become healthy"
        docker compose -f "$COMPOSE_FILE" --project-directory "$WORKSPACE_DIR" logs redis
        return 1
    fi
    log_info "Redis is healthy"

    # Wait for backend
    if ! wait_for_health "test-backend" "http://localhost:8000/health"; then
        log_error "Backend logs:"
        docker compose -f "$COMPOSE_FILE" --project-directory "$WORKSPACE_DIR" logs test-backend
        return 1
    fi

    log_info "Test infrastructure is ready"
}

# Run the frontend integration tests
run_tests() {
    log_info "Running frontend integration tests..."

    cd "$PROJECT_DIR"

    # Run vitest with the E2E test pattern
    # The tests should be configured to connect to localhost:8000
    if npm run test:run -- --reporter=verbose test/integration/; then
        log_info "All tests passed!"
        TEST_EXIT_CODE=0
    else
        log_error "Tests failed"
        TEST_EXIT_CODE=1
    fi
}

# Main execution
main() {
    log_info "=========================================="
    log_info "SYNC-012 E2E Test Runner"
    log_info "=========================================="

    check_prerequisites

    log_info "Building and starting services..."
    if ! start_infrastructure; then
        log_error "Failed to start infrastructure"
        exit 1
    fi

    log_info "Running tests..."
    run_tests

    # Exit with the test exit code
    # Cleanup will run automatically via trap
    exit $TEST_EXIT_CODE
}

# Run main
main "$@"
