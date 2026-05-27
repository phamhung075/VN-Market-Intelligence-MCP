# DEPRECATED: G5a Phase 2. Original body superseded by domain/primitives/ (plural) scaffold.
# domain/primitive/ (singular) was a proto-scaffold; canonical location is domain/primitives/.
# Zero live callers. Moved here 2026-05-24 (P2-G5a).
"""Mock primitive for pdf-extractor sandbox AC-6 test. stdlib only."""


def main(value: str) -> dict:
    """Echo the value back."""
    return {"echo": value}
