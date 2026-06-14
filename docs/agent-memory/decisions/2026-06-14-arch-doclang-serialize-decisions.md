# Decision Journal — ARCH-DOCLANG-SERIALIZE
**task_id:** ARCH-DOCLANG-SERIALIZE
**date:** 2026-06-14
**author:** architect

---

## D1: B-2 Threading strategy — why "group by table_index" not "detect continuation in upstream"

**what-considered:**
- Option A: inspect `ExtractLayoutFirstUseCase` output and convert unit_ocr_results to DTOs upstream — requires touching the layout-first use case (out of scope, touches bctc_table_rows path)
- Option B (chosen): serializer groups input DTOs by table_index; single = no thread, multiple = threaded pair — zero upstream change, pure data shape test in the serializer

**why-change:** Option A violates additive-only guarantee; B is the only safe path.

---

## D2: validate removed from DocLangSerializeUseCase hot path

**what-considered:**
- Option A: call doclang.validate() inside execute() for every document (observability)
- Option B (chosen): skip validate in production path; test-only via host venv

**why-change:** saxonche requires JRE. Dockerfile has no JRE. Adding JRE to the container for an observability-only call is unjustified overhead. Tests on host venv (which has saxonche+JRE via editable install) cover AC-1/AC-3. If container-side validation is ever needed, add `DocLangValidatePort` as a Phase 2 concern.

---

## D3: BUILD-STANDARD lean, not full

**what-considered:** apps/pdf-extractor/ already exists with full DDD scaffolding (domain/application/infrastructure/interface layers, ports, use cases, adapters, tests). New feature = lean standard. No new microservice.

**why-change:** only path: lean for existing service.

---

## D4: doclang pin at 0.6.0 (editable → must verify PyPI)

**what-considered:** venv shows 0.6.0 editable from local source. pip check clean. No numpy conflict.

**why-change:** pin to exact version that was tested; verify PyPI availability before Dockerfile build (editable installs don't work in container images from pip install -r).

---

## D5: bbox_provider hook design

**what-considered:** BA spec says add hook so Phase 2 can add location. Chose `Optional[Callable[[int, int], Tuple[int, int, int, int]]]` on `__init__` — minimal interface, no ABC, consistent with existing Protocol pattern in domain ports. The tuple is `(x, y, width, height)` in points (to be confirmed when PEK geometry is surfaced).

**why-change:** only path that keeps Phase 1 clean and Phase 2 additive.
