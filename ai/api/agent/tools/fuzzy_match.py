import difflib
from typing import List, Optional

def fuzzy_match(query: str, candidates: List[str], threshold: float = 0.6) -> Optional[str]:
    """
    Fuzzy match a query string to a list of candidate strings.
    Returns the best match if above the threshold, else None.
    """
    matches = difflib.get_close_matches(query.lower(), [c.lower() for c in candidates], n=1, cutoff=threshold)
    if matches:
        for c in candidates:
            if c.lower() == matches[0]:
                return c
    return None 