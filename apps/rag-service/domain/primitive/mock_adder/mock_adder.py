"""
Mock primitive: pure adder for sandbox runner validation only.
stdlib only — zero external imports.
"""


def main(a: float, b: float) -> dict:
    """Return the sum of a and b."""
    return {"sum": a + b}
