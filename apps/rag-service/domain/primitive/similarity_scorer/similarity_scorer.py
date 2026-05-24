"""
similarity_scorer — pure function primitive.

Converts an L2 distance to a similarity score bounded in [0, 1].
Formula: similarity = 1.0 / (1.0 + distance)

Determinism gate:
  - Input: raw float (L2 distance)
  - Output: bounded float in [0, 1]
  - No datetime, no random, no model, no DB access.
  - stdlib only.
"""


def score(distance: float) -> float:
    """
    Convert L2 distance to similarity score in [0, 1].

    Formula: similarity = 1.0 / (1.0 + distance)

    Examples:
        distance 0.0  -> similarity 1.0   (identical vectors)
        distance 0.5  -> similarity 0.667
        distance inf  -> similarity 0.0

    Raises:
        ValueError: if distance < 0 (negative distance is nonsensical).
    """
    if distance < 0:
        raise ValueError(
            f"distance must be >= 0, got {distance!r}. "
            "Negative L2 distances are geometrically impossible."
        )
    return 1.0 / (1.0 + distance)
