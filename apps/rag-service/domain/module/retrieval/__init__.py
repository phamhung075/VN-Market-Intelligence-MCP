# retrieval module — exports RetrievalModule and its Protocol ports.
# Fence-B: zero imports from infrastructure/.
from domain.module.retrieval.module import RetrievalModule
from domain.module.retrieval.ports import EmbedderModulePort, VectorSearchPort

__all__ = ["RetrievalModule", "EmbedderModulePort", "VectorSearchPort"]
