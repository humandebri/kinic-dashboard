"""Example usage of LiquidAI/LFM2-ColBERT-350M with PyLate.

Based on the model card instructions:
https://huggingface.co/LiquidAI/LFM2-ColBERT-350M
"""

from pylate import indexes, models, rank, retrieve


def build_index(model: models.ColBERT) -> indexes.PLAID:
    # Match the model card: use the EOS token for padding.
    model.tokenizer.pad_token = model.tokenizer.eos_token

    # Create a PLAID index to store document embeddings on disk.
    index = indexes.PLAID(
        index_folder="pylate-index",
        index_name="index",
        override=True,
    )

    # Example documents and their IDs.
    documents_ids = ["1", "2", "3"]
    documents = ["document 1 text", "document 2 text", "document 3 text"]

    # Encode documents (is_query=False for document embeddings).
    documents_embeddings = model.encode(
        documents,
        batch_size=32,
        is_query=False,
        show_progress_bar=True,
    )

    # Add embeddings to the index.
    index.add_documents(
        documents_ids=documents_ids,
        documents_embeddings=documents_embeddings,
    )

    return index


def retrieve_top_k(index: indexes.PLAID, model: models.ColBERT) -> None:
    # Initialize the retriever with the existing index.
    retriever = retrieve.ColBERT(index=index)

    # Encode queries (is_query=True for query embeddings).
    queries_embeddings = model.encode(
        ["query for document 3", "query for document 1"],
        batch_size=32,
        is_query=True,
        show_progress_bar=True,
    )

    # Retrieve top-k document scores for each query.
    scores = retriever.retrieve(
        queries_embeddings=queries_embeddings,
        k=10,
    )

    print("retrieval scores:", scores)


def rerank_example(model: models.ColBERT) -> None:
    # Example reranking inputs: queries with candidate documents.
    queries = [
        "query A",
        "query B",
    ]

    documents = [
        ["document A", "document B"],
        ["document 1", "document C", "document B"],
    ]

    documents_ids = [
        [1, 2],
        [1, 3, 2],
    ]

    # Encode queries and candidate documents for reranking.
    queries_embeddings = model.encode(
        queries,
        is_query=True,
    )

    documents_embeddings = model.encode(
        documents,
        is_query=False,
    )

    # Compute reranked order based on MaxSim similarity.
    reranked_documents = rank.rerank(
        documents_ids=documents_ids,
        queries_embeddings=queries_embeddings,
        documents_embeddings=documents_embeddings,
    )

    print("reranked documents:", reranked_documents)


def main() -> None:
    # Load the LFM2-ColBERT-350M model from Hugging Face.
    model = models.ColBERT(
        model_name_or_path="LiquidAI/LFM2-ColBERT-350M",
    )

    # Build an index, then run retrieval and reranking examples.
    index = build_index(model)
    retrieve_top_k(index, model)
    rerank_example(model)


if __name__ == "__main__":
    main()
