"""High-level helpers for managing Kinic memories via the Rust core."""

from __future__ import annotations

import warnings
from typing import List, Sequence, Tuple

from . import _lib as native

ScoreResult = Sequence[Tuple[float, str]]


class KinicMemories:
    """Stateful helper that mirrors the Rust CLI behavior."""

    def __init__(self, identity: str, *, ic: bool = False) -> None:
        self.identity = identity
        self.ic = ic

    def create(self, name: str, description: str) -> str:
        """Deploy a new memory canister."""
        return create_memory(self.identity, name, description, ic=self.ic)

    def list(self) -> List[str]:
        """List deployed memories."""
        return list_memories(self.identity, ic=self.ic)

    def insert_markdown(self, memory_id: str, tag: str, text: str) -> int:
        """Insert markdown text directly."""
        return insert_markdown(self.identity, memory_id, tag, text, ic=self.ic)

    def insert_markdown_file(self, memory_id: str, tag: str, path: str) -> int:
        """Insert markdown loaded from disk."""
        return insert_markdown_file(self.identity, memory_id, tag, path, ic=self.ic)

    def insert_pdf_file(self, memory_id: str, tag: str, path: str) -> int:
        """Convert a PDF to markdown and insert it."""
        return insert_pdf_file(self.identity, memory_id, tag, path, ic=self.ic)

    def insert_pdf(self, memory_id: str, tag: str, path: str) -> int:
        """Deprecated: use insert_pdf_file instead."""
        warnings.warn("insert_pdf is deprecated; use insert_pdf_file", DeprecationWarning, stacklevel=2)
        return self.insert_pdf_file(memory_id, tag, path)

    def insert_text(self, memory_id: str, tag: str, text: str) -> int:
        """Deprecated: use insert_markdown instead."""
        warnings.warn("insert_text is deprecated; use insert_markdown", DeprecationWarning, stacklevel=2)
        return self.insert_markdown(memory_id, tag, text)

    def insert_file(self, memory_id: str, tag: str, path: str) -> int:
        """Deprecated: use insert_markdown_file instead."""
        warnings.warn("insert_file is deprecated; use insert_markdown_file", DeprecationWarning, stacklevel=2)
        return self.insert_markdown_file(memory_id, tag, path)

    def search(self, memory_id: str, query: str) -> ScoreResult:
        """Search the specified memory canister."""
        return search_memories(self.identity, memory_id, query, ic=self.ic)


def create_memory(
    identity: str,
    name: str,
    description: str,
    *,
    ic: bool | None = None,
) -> str:
    return native.create_memory(identity, name, description, ic=ic)


def list_memories(identity: str, *, ic: bool | None = None) -> List[str]:
    return native.list_memories(identity, ic=ic)


def insert_markdown(
    identity: str,
    memory_id: str,
    tag: str,
    text: str,
    *,
    ic: bool | None = None,
) -> int:
    return native.insert_memory(identity, memory_id, tag, text=text, ic=ic)


def insert_markdown_file(
    identity: str,
    memory_id: str,
    tag: str,
    path: str,
    *,
    ic: bool | None = None,
) -> int:
    return native.insert_memory(identity, memory_id, tag, file_path=path, ic=ic)


def insert_pdf_file(
    identity: str,
    memory_id: str,
    tag: str,
    path: str,
    *,
    ic: bool | None = None,
) -> int:
    return native.insert_memory_pdf(identity, memory_id, tag, path, ic=ic)


def insert_pdf(
    identity: str,
    memory_id: str,
    tag: str,
    path: str,
    *,
    ic: bool | None = None,
) -> int:
    warnings.warn("insert_pdf is deprecated; use insert_pdf_file", DeprecationWarning, stacklevel=2)
    return insert_pdf_file(identity, memory_id, tag, path, ic=ic)


def insert_text(
    identity: str,
    memory_id: str,
    tag: str,
    text: str,
    *,
    ic: bool | None = None,
) -> int:
    warnings.warn("insert_text is deprecated; use insert_markdown", DeprecationWarning, stacklevel=2)
    return insert_markdown(identity, memory_id, tag, text, ic=ic)


def insert_file(
    identity: str,
    memory_id: str,
    tag: str,
    path: str,
    *,
    ic: bool | None = None,
) -> int:
    warnings.warn("insert_file is deprecated; use insert_markdown_file", DeprecationWarning, stacklevel=2)
    return insert_markdown_file(identity, memory_id, tag, path, ic=ic)


def search_memories(
    identity: str,
    memory_id: str,
    query: str,
    *,
    ic: bool | None = None,
) -> ScoreResult:
    return native.search_memories(identity, memory_id, query, ic=ic)
