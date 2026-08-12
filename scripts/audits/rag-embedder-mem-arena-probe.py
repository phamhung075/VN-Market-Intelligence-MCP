"""
scripts/audits/rag-embedder-mem-arena-probe.py

FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS — isolated
reproduction/discrimination probe for candidate (1) named in the PO's
2026-08-12T03:03:00Z status_note ("per-request embedder tensor/cache
accumulation"): does REPEATED, real-traffic-shaped encode() invocation on an
already-loaded model grow RSS monotonically call-over-call, and is any of
that growth glibc-malloc-arena-retained (recoverable via malloc_trim(0),
same mechanism as FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM) as opposed
to a genuine, non-reclaimable PyTorch/oneDNN internal cache?

WHAT THIS DOES
    Runs the REAL production code path (infrastructure.embedder.
    SentenceTransformersEmbedder._raw_embed(), i.e. exactly what embed()/
    embed_batch() call) N times in a row against realistic VN-financial-news
    -length text batches, sampling this process's own VmRSS after every call.
    After the full loop: gc.collect() (candidate 'unreleased Python heap')
    then malloc_trim(0) (candidate 'glibc malloc-arena fragmentation') are
    applied in sequence so each one's own marginal recovery is visible.

WHY A SEPARATE CONTAINER, NOT THE LIVE PID1
    Same reasoning as the PDFX precedent (scripts/audits/pdfx-pek-mem-arena-
    probe.py): the live rag-service container shares a single 1 GiB cgroup
    budget with real production traffic and is already running close to that
    cap (this row's own subject). Running N repeated encode() calls inside a
    THROWAWAY, separate-cgroup `docker run --rm` container from the SAME
    image (model is baked into /opt/model-cache at build time — HF_HUB_
    OFFLINE=1 means this needs no network and no volume mount at all) proves
    the mechanism without touching the live container's memory budget or its
    request/response timing.

USAGE (from repo root, docker compose project already built):
    docker run --rm \
      -v "$(pwd)/scripts/audits:/probe:ro" \
      --entrypoint python3 \
      vn-market-intelligence-mcp-rag-service:latest \
      /probe/rag-embedder-mem-arena-probe.py [N_CALLS]

    N_CALLS defaults to 60 (roughly the call volume a single embedder singleton
    would see across ~15-30 min of the observed live traffic mix — see the
    architect brief for the live-traffic correlation this number is chosen
    to approximate).

Companion probe (candidate 2, LanceDB reader/mmap accumulation — separate
script, needs a real/representative corpus so it is NOT bundled here):
    scripts/audits/rag-lancedb-search-mem-arena-probe.py
"""
import ctypes
import gc
import sys
import time


def rss_kb() -> int:
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    return -1


def log(stage: str, extra=None) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[PROBE] stage={stage} rss_kb={rss_kb()} ts={ts} extra={extra}", flush=True)


# Realistic VN-financial-news-shaped batches — vary length/content per call so
# the tokenizer/model do not see byte-identical input every time (a fixed
# input could mask a real cache-growth mechanism keyed on distinct content,
# e.g. a tokenizer vocab/cache keyed by novel tokens).
_SAMPLE_TITLES = [
    "Ngân hàng Nhà nước điều chỉnh lãi suất điều hành trong bối cảnh lạm phát",
    "VN-Index tăng điểm phiên thứ ba liên tiếp nhờ dòng tiền khối ngoại",
    "Vietcombank công bố kết quả kinh doanh quý với lợi nhuận tăng trưởng",
    "Thị trường bất động sản phía Nam ghi nhận tín hiệu phục hồi rõ nét",
    "Xuất khẩu thủy sản Việt Nam đạt mức cao kỷ lục trong nửa đầu năm",
    "Giá vàng trong nước biến động mạnh theo diễn biến thị trường quốc tế",
    "Doanh nghiệp dệt may đối mặt áp lực chi phí nguyên liệu đầu vào tăng",
    "Chính phủ ban hành nghị định mới về quản lý thị trường trái phiếu",
]
_SAMPLE_SUMMARIES = [
    (
        "Theo báo cáo mới nhất, các chỉ số kinh tế vĩ mô cho thấy xu hướng ổn "
        "định trong ngắn hạn, tuy nhiên vẫn còn nhiều rủi ro tiềm ẩn từ biến "
        "động tỷ giá và lãi suất toàn cầu, đòi hỏi các nhà điều hành chính "
        "sách phải theo dõi sát sao diễn biến thị trường trong những tháng tới."
    ),
    (
        "Kết quả phân tích kỹ thuật cho thấy nhóm cổ phiếu ngân hàng và bất "
        "động sản đang dẫn dắt đà tăng của thị trường chung, thanh khoản cải "
        "thiện đáng kể so với giai đoạn trước, phản ánh tâm lý tích cực của "
        "nhà đầu tư trong và ngoài nước đối với triển vọng kinh tế Việt Nam."
    ),
]


def build_batch(i: int) -> list[str]:
    """Vary batch size 1-4 and content per call — mirrors real request shape
    (single-article embed() calls interleaved with occasional multi-entry
    embed_batch() calls), not a fixed synthetic payload."""
    batch_size = 1 + (i % 4)
    texts = []
    for j in range(batch_size):
        title = _SAMPLE_TITLES[(i + j) % len(_SAMPLE_TITLES)]
        summary = _SAMPLE_SUMMARIES[(i + j) % len(_SAMPLE_SUMMARIES)]
        texts.append(f"{title}. {summary} [call={i} item={j}]")
    return texts


def main() -> None:
    sys.path.insert(0, "/app")

    n_calls = int(sys.argv[1]) if len(sys.argv) > 1 else 60

    log("start", {"n_calls": n_calls})

    from infrastructure.embedder import SentenceTransformersEmbedder  # noqa: E402

    embedder = SentenceTransformersEmbedder(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        cache_dir="/opt/model-cache",
    )

    t0 = time.time()
    embedder._load_model()  # synchronous — same call _ensure_model_loaded() makes via to_thread
    log("model_loaded", {"elapsed_s": round(time.time() - t0, 1)})

    libc = ctypes.CDLL("libc.so.6")
    rss_series = []

    for i in range(n_calls):
        batch = build_batch(i)
        embedder._raw_embed(batch)  # EXACT production call — embed()/embed_batch() both route here
        r = rss_kb()
        rss_series.append(r)
        if i < 5 or i % 10 == 0 or i == n_calls - 1:
            log(f"call_{i}", {"batch_size": len(batch)})

    log("loop_done", {
        "rss_first": rss_series[0],
        "rss_last": rss_series[-1],
        "delta_kb": rss_series[-1] - rss_series[0],
        "delta_mib": round((rss_series[-1] - rss_series[0]) / 1024, 1),
    })

    gc.collect()
    log("after_gc", {"recovered_kb_vs_loop_end": rss_series[-1] - rss_kb()})

    trimmed = libc.malloc_trim(0)
    log("after_malloc_trim", {
        "malloc_trim_returned": trimmed,
        "recovered_kb_vs_loop_end": rss_series[-1] - rss_kb(),
    })

    log("gc_stats_final", {"counts": gc.get_count(), "garbage_len": len(gc.garbage)})
    print("[PROBE] DONE", flush=True)


if __name__ == "__main__":
    main()
