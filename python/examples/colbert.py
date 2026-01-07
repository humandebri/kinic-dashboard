"""Example usage of LiquidAI/LFM2-ColBERT-350M with PyLate.

Based on the model card instructions:
https://huggingface.co/LiquidAI/LFM2-ColBERT-350M
"""

import json
from typing import Iterable, List, Sequence, Tuple

from kinic_py import KinicMemories
from pylate import indexes, models, rank, retrieve


def retrieval_and_rerank(model: models.ColBERT, kinic: KinicMemories) -> None:
    memory_id = kinic.create("ColBERT demo", "Created from colbert.py example")

    documents_ids = ["doc-1", "doc-2", "doc-3"]
    documents = [
        "document 1 text",
        "document 2 text",
        "document 3 text",
    ]

    # Build a bag-of-embeddings for each document and insert each token vector with the doc tag.
    documents_embeddings = model.encode(
        documents,
        batch_size=32,
        is_query=False,
        show_progress_bar=True,
    )

    for doc_id, doc_text, token_embeddings in zip(
        documents_ids, documents, documents_embeddings
    ):
        for token_embedding in as_matrix(token_embeddings):
            kinic.insert_raw(memory_id, doc_id, doc_text, token_embedding)

    queries = ["query for document 3", "query for document 1"]
    queries_embeddings = model.encode(
        queries,
        batch_size=32,
        is_query=True,
        show_progress_bar=True,
    )

    for query, query_embeddings in zip(queries, queries_embeddings):
        query_vectors = as_matrix(query_embeddings)
        candidate_tags = collect_candidate_tags(kinic, memory_id, query_vectors)
        reranked = rerank_by_maxsim(kinic, memory_id, query_vectors, candidate_tags)
        print(f"query: {query}")
        print("reranked:", reranked)


def as_matrix(embeddings: object) -> List[List[float]]:
    if hasattr(embeddings, "tolist"):
        return embeddings.tolist()
    if isinstance(embeddings, list):
        return embeddings
    return list(embeddings)


def collect_candidate_tags(
    kinic: KinicMemories,
    memory_id: str,
    query_vectors: Sequence[Sequence[float]],
    *,
    per_vector_limit: int = 5,
) -> List[str]:
    tags = []
    seen = set()
    for vector in query_vectors:
        results = kinic.search_raw(memory_id, vector)
        for score, payload in results[:per_vector_limit]:
            tag = parse_tag(payload)
            if tag and tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags


def parse_tag(payload: str) -> str | None:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict):
        return data.get("tag")
    return None


def rerank_by_maxsim(
    kinic: KinicMemories,
    memory_id: str,
    query_vectors: Sequence[Sequence[float]],
    candidate_tags: Iterable[str],
) -> List[Tuple[str, float]]:
    # Fetch each candidate's bag-of-embeddings from the memory canister.
    documents_ids = list(candidate_tags)
    documents_embeddings = [
        kinic.tagged_embeddings(memory_id, tag) for tag in documents_ids
    ]

    # Use PyLate's MaxSim-based reranker for late interaction scoring.
    reranked = rank.rerank(
        documents_ids=[documents_ids],
        queries_embeddings=[query_vectors],
        documents_embeddings=[documents_embeddings],
    )
    return reranked[0]


def main() -> None:
    # Load the LFM2-ColBERT-350M model from Hugging Face.
    model = models.ColBERT(
        model_name_or_path="LiquidAI/LFM2-ColBERT-350M",
    )
    kinic = KinicMemories("alice")
    retrieval_and_rerank(model, kinic)


if __name__ == "__main__":
    main()
