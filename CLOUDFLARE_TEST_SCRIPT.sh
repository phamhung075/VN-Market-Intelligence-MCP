#!/bin/bash
# Cloudflare Routing — Integration Test Script
# Tests both production (Cloudflare) and local dev (localhost) modes

set -e

LOCALHOST_URL="http://localhost:3000"
PRODUCTION_URL="https://zenmidi.com/vn-market"
API_KEY="${VPS_PUSH_API_KEY:-test-key}"
VERBOSE="${1:-false}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
fail_count=0

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local expected_status="$4"
    local headers="$5"
    local data="$6"

    ((test_count++))
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo "Testing: $name"
        echo "URL: $url"
        echo "Method: $method"
    fi

    # Build curl command
    local cmd="curl -s -w '\n%{http_code}' -X $method '$url'"
    
    if [[ ! -z "$headers" ]]; then
        cmd="$cmd $headers"
    fi
    
    if [[ ! -z "$data" ]]; then
        cmd="$cmd -d '$data' -H 'Content-Type: application/json'"
    fi

    # Execute and capture response
    local response=$(eval "$cmd")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [[ "$http_code" == "$expected_status" ]]; then
        success "$name (HTTP $http_code)"
        ((pass_count++))
        return 0
    else
        error "$name - Expected HTTP $expected_status, got $http_code"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "Response: $body"
        fi
        ((fail_count++))
        return 1
    fi
}

# ────────────────────────────────────────────────────────────────────────────
# Test Suite 1: Local Development Mode
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "Test Suite 1: Local Development (localhost:3000)"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

log "Testing basic connectivity and route handling..."
echo ""

test_endpoint "Health check" "GET" "$LOCALHOST_URL/health" "200" "" ""
test_endpoint "Root endpoint" "GET" "$LOCALHOST_URL/" "200" "" ""

log "Testing API endpoints (require auth)..."
echo ""

test_endpoint "Watchlist - unauthorized" "GET" "$LOCALHOST_URL/api/watchlist" "401" "" ""
test_endpoint "Watchlist - authorized" "GET" "$LOCALHOST_URL/api/watchlist" "200" "-H 'X-API-Key: $API_KEY'" ""

log "Testing path prefix handling in local mode..."
echo ""

# These should NOT match (no prefix stripping in local mode for non-prefixed paths)
test_endpoint "Local /api path (no prefix)" "GET" "$LOCALHOST_URL/api/foreign-flow-status" "401" "-H 'X-API-Key: $API_KEY'" ""

# ────────────────────────────────────────────────────────────────────────────
# Test Suite 2: Production Mode (if accessible)
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "Test Suite 2: Production (Cloudflare Routing)"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

# Check if production URL is reachable
if timeout 5 curl -s -o /dev/null "$PRODUCTION_URL/health" 2>/dev/null; then
    log "Production URL is reachable, running tests..."
    echo ""
    
    test_endpoint "Health check via Cloudflare" "GET" "$PRODUCTION_URL/health" "200" "" ""
    test_endpoint "Root endpoint via Cloudflare" "GET" "$PRODUCTION_URL/" "200" "" ""
    
    log "Testing path prefix routing..."
    echo ""
    
    test_endpoint "Watchlist via Cloudflare - unauthorized" "GET" "$PRODUCTION_URL/api/watchlist" "401" "" ""
    test_endpoint "Watchlist via Cloudflare - authorized" "GET" "$PRODUCTION_URL/api/watchlist" "200" "-H 'X-API-Key: $API_KEY'" ""
    
    test_endpoint "Foreign flow status via Cloudflare" "GET" "$PRODUCTION_URL/api/foreign-flow-status" "200" "-H 'X-API-Key: $API_KEY'" ""
else
    warn "Production URL not reachable. Skipping production tests."
    warn "Make sure Cloudflare routing is configured and the server is deployed."
fi

# ────────────────────────────────────────────────────────────────────────────
# Test Suite 3: Path Prefix Stripping Verification
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "Test Suite 3: Path Prefix Stripping Logic"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

log "Verifying source code contains path stripping function..."
echo ""

if grep -q "stripCloudflarePathPrefix" /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/interface/mcp/server.ts; then
    success "stripCloudflarePathPrefix function found in server.ts"
    ((pass_count++))
else
    error "stripCloudflarePathPrefix function NOT found in server.ts"
    ((fail_count++))
fi

if grep -q 'pathname = stripCloudflarePathPrefix(url.pathname)' /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/interface/mcp/server.ts; then
    success "Path stripping applied to pathname assignment"
    ((pass_count++))
else
    error "Path stripping NOT applied to pathname assignment"
    ((fail_count++))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test Suite 4: Configuration Verification
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "Test Suite 4: Configuration Verification"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

log "Checking mcp.config.json..."
echo ""

if grep -q '"host": "0.0.0.0"' /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/mcp.config.json; then
    success "mcp.config.json: host set to 0.0.0.0"
    ((pass_count++))
else
    error "mcp.config.json: host NOT set to 0.0.0.0"
    ((fail_count++))
fi

log "Checking docker-compose.yml..."
echo ""

if grep -q 'HOST: 0.0.0.0' /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml; then
    success "docker-compose.yml: HOST=0.0.0.0 set"
    ((pass_count++))
else
    error "docker-compose.yml: HOST=0.0.0.0 NOT set"
    ((fail_count++))
fi

if grep -q 'cloudflare_path' /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml; then
    success "docker-compose.yml: Cloudflare labels added"
    ((pass_count++))
else
    warn "docker-compose.yml: Cloudflare labels NOT found (optional)"
fi

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "Test Summary"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo -e "Total Tests:  $test_count"
echo -e "Passed:       ${GREEN}$pass_count${NC}"
echo -e "Failed:       ${RED}$fail_count${NC}"

if [[ $fail_count -eq 0 ]]; then
    echo ""
    success "All tests passed!"
    exit 0
else
    echo ""
    error "$fail_count test(s) failed. Review above for details."
    exit 1
fi
