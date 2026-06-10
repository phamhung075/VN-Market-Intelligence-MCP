# GFD-7: Add /embed/health probe endpoint to rag-service + reduce memory limits

**Task ID:** GFD-7  
**Owner:** dev-rag-service  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** M (est. 4h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** READY

## Context

rag-service is a Python/FastAPI service (NOT being ported to Go — architect decision in brief § (b)). However, it is currently DARK (no capability probe). Before ops can deploy, dev-rag-service must:

1. Add a new `/embed/health` endpoint that probes the sentence-transformer model and LanceDB index
2. Reduce memory limits in docker-compose.yml from 1g/1.5g to 512m/768m (tight but safe per brief § (c))

This makes rag-service observable and brings it into the managed fleet.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (b) § rag-service Strategy & § (d) § rag-service New Capability Probe

## Acceptance Criteria (DoD)

- [ ] New GET `/embed/health` endpoint implemented in FastAPI app (alongside existing `/health`)
- [ ] Endpoint returns 200 with JSON: `{"status": "ok", "model_loaded": true, "index_size": <int>, "model_name": "<str>"}`
- [ ] Endpoint verifies sentence-transformer model is loaded (run 1-token encode test)
- [ ] Endpoint verifies LanceDB table is accessible (open table, return row count — 0 is acceptable for fresh deploy)
- [ ] Endpoint returns 503 with JSON: `{"status": "error", "reason": "<str>"}` if model not loaded
- [ ] `docker-compose.yml` updated: reservations.memory 1g → 512m, limits.memory 1.5g → 768m
- [ ] No other code changes (FastAPI, embedding logic, LanceDB stays unchanged)

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/rag-service`
- Main app: `apps/rag-service/main.py` or equivalent entry point
- Compose: `docker-compose.yml` (search for rag-service section)

## Implementation Steps

1. **Add /embed/health endpoint to FastAPI app:**
   ```python
   from fastapi import FastAPI, Response
   from sentence_transformers import SentenceTransformer
   import lancedb
   
   app = FastAPI()
   
   # Global model reference (already loaded at startup)
   # Assume: model = SentenceTransformer(...) is already initialized
   # Assume: db = lancedb.connect(...) is already initialized
   
   @app.get("/embed/health")
   async def embed_health():
       try:
           # Test 1: Verify model is loaded and callable
           if model is None:
               return Response(
                   status_code=503,
                   content=json.dumps({"status": "error", "reason": "model not loaded"})
               )
           
           # Quick encode test (1 token)
           _ = model.encode("test", convert_to_tensor=False)
           
           # Test 2: Verify LanceDB is accessible
           table = db.open_table("embeddings")  # Adjust table name as needed
           index_size = len(table)  # Row count
           
           # Success
           return {
               "status": "ok",
               "model_loaded": True,
               "index_size": index_size,
               "model_name": model.get_sentence_embedding_dimension() or "unknown"
           }
       except Exception as e:
           return Response(
               status_code=503,
               content=json.dumps({"status": "error", "reason": str(e)})
           )
   ```

2. **Update docker-compose.yml memory limits:**
   - Find rag-service service block
   - Change `deploy.resources.reservations.memory: 1g` → `512m`
   - Change `deploy.resources.limits.memory: 1.5g` → `768m`

3. **Test locally (if possible):**
   - Verify endpoint returns 200 with correct JSON structure
   - Verify model_loaded is true
   - Verify index_size is an integer

## Next Steps (for ops)

Once GFD-7 passes, it unblocks GFD-8 (deploy + extended 20-min HONOR-PANIC-GUARD soak).

## Notes

- This is a feature addition to rag-service, not a refactor
- The endpoint is read-only and non-blocking (queries model + DB, no writes)
- Model warm-up on first request can take up to 60s; soak window is extended to 20 minutes to account for this
- Keep existing `/health` endpoint unchanged (standard HTTP health check for container orchestration)
- The `/embed/health` endpoint is specifically for capability_manifest probe in mcp-server
