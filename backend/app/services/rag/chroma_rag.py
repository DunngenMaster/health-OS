from pathlib import Path
from typing import Any

from app.services.hospital_os.storage import CHROMA_STORE_DIR, slugify

try:
    import chromadb
    from chromadb.config import Settings
    from chromadb.utils import embedding_functions

    CHROMA_AVAILABLE = True
except Exception:
    CHROMA_AVAILABLE = False
    chromadb = None  # type: ignore
    Settings = None  # type: ignore
    embedding_functions = None  # type: ignore

CHUNK_WORDS = 180
CHUNK_OVERLAP = 40


def _client():
    if not CHROMA_AVAILABLE:
        raise RuntimeError("chromadb is required for clinical evidence retrieval. Run: pip install chromadb")
    persist_dir = str(CHROMA_STORE_DIR)
    Path(persist_dir).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=persist_dir, settings=Settings(anonymized_telemetry=False))


def _embedding_function():
    return embedding_functions.DefaultEmbeddingFunction()


def _chunk_document(doc_id: str, text: str, metadata: dict[str, Any]) -> list[dict[str, Any]]:
    words = text.split()
    if not words:
        return []

    chunks: list[dict[str, Any]] = []
    step = max(1, CHUNK_WORDS - CHUNK_OVERLAP)
    for index in range(0, len(words), step):
        content = " ".join(words[index:index + CHUNK_WORDS]).strip()
        if not content:
            continue
        chunk_id = f"{doc_id}-{index // step}"
        chunks.append({
            "chunk_id": chunk_id,
            "content": content,
            "metadata": {
                "source": str(metadata.get("source", "")),
                "data_source_type": str(metadata.get("data_source_type", "simulated")),
                "doc_id": doc_id,
            },
        })
    return chunks


def build_rag_index(hospital_id: str, documents: list[dict[str, Any]]) -> int:
    """Index documents in ChromaDB. Returns number of chunks stored."""
    if not CHROMA_AVAILABLE:
        return 0

    collection_name = f"hospital_{slugify(hospital_id)}"
    client = _client()

    try:
        client.delete_collection(collection_name)
    except Exception:
        pass

    collection = client.create_collection(
        name=collection_name,
        metadata={"hospital_id": hospital_id},
        embedding_function=_embedding_function(),
    )

    ids: list[str] = []
    texts: list[str] = []
    metadatas: list[dict[str, str]] = []

    for document in documents:
        for chunk in _chunk_document(
            document["doc_id"],
            document["text"],
            document.get("metadata", {}),
        ):
            ids.append(chunk["chunk_id"])
            texts.append(chunk["content"])
            metadatas.append(chunk["metadata"])

    if ids:
        collection.add(ids=ids, documents=texts, metadatas=metadatas)

    return len(ids)


def retrieve_context(hospital_id: str, query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Semantic search against the hospital's Chroma collection."""
    if not CHROMA_AVAILABLE:
        return []

    collection_name = f"hospital_{slugify(hospital_id)}"
    client = _client()
    try:
        collection = client.get_collection(
            name=collection_name,
            embedding_function=_embedding_function(),
        )
    except Exception:
        return []

    results = collection.query(query_texts=[query], n_results=top_k)

    hits: list[dict[str, Any]] = []
    documents = results.get("documents") or [[]]
    metadatas = results.get("metadatas") or [[]]
    distances = results.get("distances") or [[]]
    ids = results.get("ids") or [[]]

    for index, doc_id in enumerate(ids[0]):
        distance = distances[0][index] if distances[0] else 1.0
        hits.append({
            "chunk_id": doc_id,
            "content": documents[0][index],
            "metadata": metadatas[0][index] if metadatas[0] else {},
            "score": round(max(0, 1 - distance), 3),
        })
    return hits


def collection_chunk_count(hospital_id: str) -> int:
    if not CHROMA_AVAILABLE:
        return 0
    collection_name = f"hospital_{slugify(hospital_id)}"
    try:
        collection = _client().get_collection(name=collection_name, embedding_function=_embedding_function())
        return collection.count()
    except Exception:
        return 0
