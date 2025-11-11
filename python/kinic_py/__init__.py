"""Python wrapper package for the Kinic Rust extension."""

from __future__ import annotations

from . import _lib as native

__all__ = ["greet", "native", "__version__"]
__version__ = "0.1.0"


def greet() -> str:
    """Call the demo greeting exported from the Rust module."""
    return native.greet()
