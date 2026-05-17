# 03 — Tools (Partie A) : AI/ML, Cloud, Database, File, Search

## Vue d'ensemble

Cette partie couvre l'ingestion exhaustive du **LOT 3 de la documentation CrewAI** : 46 outils distribués sur 5 catégories clés. Chaque outil est documenté avec ses dépendances, variables d'environnement, signatures et pertinence pour le projet **Daily Chief of Staff AI**. Les outils sélectionnés pour V1/V2 privilégient la recherche web, l'ingestion de documents, et l'intégration avec les services déjà câblés (.env.local : Tavily, Exa, E2B, etc.).

---

## AI/ML Tools

### AIMindTool
**Lien :** `/en/tools/ai-ml/aimindtool.md`

**À quoi sert :** Wrapper autour MindsDB AI-Minds pour requêtes en langage naturel sur PostgreSQL, MySQL, MariaDB, ClickHouse, Snowflake, BigQuery.

**Installation :**
```bash
uv add minds-sdk
```

**Import :**
```python
from crewai_tools import AIMindTool
```

**Env vars requises :** `MINDS_API_KEY`

**Signatures clés :**
```python
AIMindTool(api_key: Optional[str], datasources: List[Dict])
tool.run(query: str) → result
```

**Mini snippet :**
```python
aimind_tool = AIMindTool(
    datasources=[{
        "description": "house sales data",
        "engine": "postgres",
        "connection_data": {...}
    }]
)
result = aimind_tool.run("How many 3 bedroom houses sold in 2008?")
```

**Pertinence Daily Chief of Staff :** NON — Niche spécialisée (MindsDB), redondant avec NL2SQLTool pour requêtes DB.

---

### CodeInterpreterTool
**Lien :** `/en/tools/ai-ml/codeinterpretertool.md`

**À quoi sert :** Exécute du code Python 3 en environnement isolé (Docker).

**⚠️ Note :** Outil **supprimé** de `crewai-tools`. Utiliser E2B ou Daytona à la place.

**Pertinence Daily Chief of Staff :** NON — Déprécié; utiliser E2BPythonTool à la place.

---

### DallETool
**Lien :** `/en/tools/ai-ml/dalletool.md`

**À quoi sert :** Génère des images à partir de descriptions textuelles via DALL-E 3 (OpenAI).

**Import :**
```python
from crewai_tools import DallETool
```

**Env vars :** `OPENAI_API_KEY`

**Signatures :**
```python
DallETool(model="dall-e-3", size="1024x1024", quality="standard", n=1)
tool.run(prompt: str) → image_url
```

**Pertinence Daily Chief of Staff :** NON — Génération d'images hors scope du Chief of Staff V1/V2.

---

### Daytona Suite (Exec / Python / File)
**Lien :** `/en/tools/ai-ml/daytona.md`

**À quoi sert :** Suite de 3 outils pour exécution de commandes shell, Python, et manipulation de fichiers dans des sandboxes isolés Daytona (alternative E2B).

**Installation :**
```bash
uv add "crewai-tools[daytona]"
```

**Imports :**
```python
from crewai_tools import DaytonaExecTool, DaytonaPythonTool, DaytonaFileTool
```

**Env vars :** `DAYTONA_API_KEY`, `DAYTONA_API_URL` (optionnel), `DAYTONA_TARGET` (optionnel)

**Signatures :**
```python
DaytonaExecTool().run(command: str, cwd: str = None, timeout: int = None)
DaytonaPythonTool().run(code: str, argv: list = None)
DaytonaFileTool().run(action: str, path: str, content: str = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Alternatif E2B, moins mature. NON si E2B déjà câblé.

---

### E2B Suite (Exec / Python / File)
**Lien :** `/en/tools/ai-ml/e2bsandboxtools.md`

**À quoi sert :** Suite de 3 outils E2B pour exécution code/shell et opérations fichiers en environnement sandbox cloud isolé.

**Installation :**
```bash
uv add "crewai-tools[e2b]"
export E2B_API_KEY="e2b_..."
```

**Imports :**
```python
from crewai_tools import E2BExecTool, E2BPythonTool, E2BFileTool
```

**Env vars :** `E2B_API_KEY`

**Signatures :**
```python
E2BExecTool().run(command: str, cwd: str = None, timeout: float = None)
E2BPythonTool().run(code: str, language: str = None)
E2BFileTool().run(action: str, path: str, content: str = None)
```

**Pertinence Daily Chief of Staff :** OUI — Déjà dans .env.local (E2B_API_KEY). Excellent pour exécution sécurisée d'analyses, conversion fichiers (pièces jointes Gmail).

---

### LangChainTool
**Lien :** `/en/tools/ai-ml/langchaintool.md`

**À quoi sert :** Wrapper d'intégration permettant l'usage des outils LangChain (200+) dans CrewAI agents.

**Imports :**
```python
from crewai.tools import BaseTool
from langchain_community.utilities import GoogleSerperAPIWrapper
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile si besoin de LangChain-specific tools non couverts par CrewAI natives.

---

### LlamaIndexTool
**Lien :** `/en/tools/ai-ml/llamaindextool.md`

**À quoi sert :** Wrapper d'intégration LlamaIndex pour RAG queries et LlamaIndex query engines dans CrewAI agents.

**Installation :** `uv add llama-index`

**Imports :**
```python
from crewai_tools import LlamaIndexTool
from llama_index.core import VectorStoreIndex
```

**Signatures :**
```python
LlamaIndexTool.from_tool(tool: Any) → LlamaIndexTool
LlamaIndexTool.from_query_engine(query_engine: Any, name: str, description: str) → LlamaIndexTool
```

**Pertinence Daily Chief of Staff :** À évaluer — Alternative à RagTool. RagTool plus intégré.

---

### RagTool
**Lien :** `/en/tools/ai-ml/ragtool.md`

**À quoi sert :** Knowledge base dynamique (RAG) pour répondre à des questions via Retrieval-Augmented Generation sur multiples sources (PDF, CSV, web, YouTube, GitHub, Gmail, Slack, bases de données).

**Import :**
```python
from crewai_tools import RagTool
```

**Env vars :** Dépend du model d'embedding (`OPENAI_API_KEY`).

**Signatures :**
```python
RagTool(summarize: bool = False, config: Optional[RagToolConfig] = None)
tool.add(data_type: str, path: Optional[str] = None, url: Optional[str] = None)
tool.run(query: str) → answer
```

**Mini snippet :**
```python
rag_tool = RagTool()
rag_tool.add(data_type="web_page", url="https://docs.crewai.com")
rag_tool.add(data_type="file", path="company_handbook.pdf")
result = rag_tool.run("What's the company's vacation policy?")
```

**Pertinence Daily Chief of Staff :** OUI — Cœur du système. Mémoire long terme pour connaissances utilisateur, documents importants (contrats, politiques, docs perso). Intégrer avec sources Gmail (pièces jointes), Notion (notes), documents locaux.

---

### VisionTool
**Lien :** `/en/tools/ai-ml/visiontool.md`

**À quoi sert :** Extraction de texte depuis images (URL ou chemin local) via LLM vision-capable.

**Env vars :** `OPENAI_API_KEY`

**Signatures :**
```python
VisionTool()
tool.run(image_path_url: str) → extracted_text
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour OCR pièces jointes Gmail (captures, scans). Moins critique que RAG/File tools.

---

## Cloud Storage Tools

### BedrockKBRetrieverTool
**Lien :** `/en/tools/cloud-storage/bedrockkbretriever.md`

**À quoi sert :** Retrieval depuis Amazon Bedrock Knowledge Bases via requêtes langage naturel.

**Env vars :** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_KB_ID`

**Pertinence Daily Chief of Staff :** NON — AWS-specific. Redondant avec RagTool.

---

### S3ReaderTool / S3WriterTool
**Lien :** `/en/tools/cloud-storage/s3readertool.md`, `s3writertool.md`

**À quoi sert :** Lecture/écriture de fichiers vers Amazon S3 buckets.

**Installation :** `uv add boto3`

**Imports :**
```python
from crewai_tools.aws.s3 import S3ReaderTool, S3WriterTool
```

**Env vars :** `CREW_AWS_REGION`, `CREW_AWS_ACCESS_KEY_ID`, `CREW_AWS_SEC_ACCESS_KEY`

**Signatures :**
```python
S3ReaderTool()._run(file_path: str)  # "s3://bucket/file"
S3WriterTool()._run(file_path: str, content: str)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile si Cloudflare R2 (S3-compat) déjà câblé. Considérer pour stockage pièces jointes Gmail archivées.

---

## Database & Data Tools

### MongoDBVectorSearchTool
**Lien :** `/en/tools/database-data/mongodbvectorsearchtool.md`

**Installation :** `pip install crewai-tools[mongodb]`

**Imports :**
```python
from crewai_tools import MongoDBVectorSearchTool, MongoDBVectorSearchConfig
```

**Signatures :**
```python
MongoDBVectorSearchTool(
    connection_string: str,
    database_name: str,
    collection_name: str,
    vector_index_name: str = "vector_index",
    embedding_key: str = "embedding",
    dimensions: int = 1536
)
```

**Pertinence Daily Chief of Staff :** NON — MongoDB niche. Pas d'indication utilisation MongoDB dans stack actuel.

---

### MySQLSearchTool
**Lien :** `/en/tools/database-data/mysqltool.md`

**Import :**
```python
from crewai_tools import MySQLSearchTool
```

**Signatures :**
```python
MySQLSearchTool(db_uri: str, table_name: str, config: dict = None)
```

**Pertinence Daily Chief of Staff :** NON — MySQL spécifique. Supabase Postgres déjà câblé.

---

### NL2SQLTool
**Lien :** `/en/tools/database-data/nl2sqltool.md`

**À quoi sert :** Convertit requêtes langage naturel en SQL pour interroger DB. Read-only par défaut.

**Import :**
```python
from crewai_tools import NL2SQLTool
```

**Env vars :** `CREWAI_NL2SQL_ALLOW_DML=true` (optionnel)

**Signatures :**
```python
NL2SQLTool(db_uri: str, allow_dml: bool = False)
tool.run(query: str) → sql_results
```

**Mini snippet :**
```python
nl2sql = NL2SQLTool(
    db_uri="postgresql://user:pass@localhost:5432/production",
    allow_dml=False
)
results = nl2sql.run("How many tasks created this week?")
```

**Pertinence Daily Chief of Staff :** OUI — Excellent pour requêter Supabase Postgres (`crew_runs`, `crew_run_steps`) en langage naturel pour analytics Chief of Staff.

---

### PGSearchTool
**Lien :** `/en/tools/database-data/pgsearchtool.md`

**À quoi sert :** Recherche sémantique (RAG) sur PostgreSQL avec vector embeddings.

**Import :**
```python
from crewai_tools import PGSearchTool
```

**Signatures :**
```python
PGSearchTool(db_uri: str, table_name: str, config: dict = None)
```

**Pertinence Daily Chief of Staff :** OUI — Alternative RAG si Supabase Postgres en place (pgvector). Combine NL2SQLTool + embeddings.

---

### QdrantVectorSearchTool
**Lien :** `/en/tools/database-data/qdrantvectorsearchtool.md`

**Installation :** `uv add qdrant-client`

**Imports :**
```python
from crewai_tools import QdrantVectorSearchTool, QdrantConfig
```

**Env vars :** `QDRANT_URL`, `QDRANT_API_KEY` (optionnel), `OPENAI_API_KEY`

**Signatures :**
```python
QdrantVectorSearchTool(qdrant_config=QdrantConfig(
    qdrant_url, qdrant_api_key, collection_name,
    limit=3, score_threshold=0.35
))
tool.run(query: str, filter_by: str = None, filter_value: Any = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Excellent pour vector search spécialisé (V2 mémoire long terme emails/Slack).

---

### SingleStoreSearchTool / SnowflakeSearchTool / WeaviateVectorSearchTool
**Liens :** `singlestoresearchtool.md`, `snowflakesearchtool.md`, `weaviatevectorsearchtool.md`

**Pertinence Daily Chief of Staff :** NON pour SingleStore/Snowflake (enterprise niche). À évaluer Weaviate (hybrid search puissant, alternative RAG).

---

## File & Document Tools

### CSVSearchTool
**Lien :** `/en/tools/file-document/csvsearchtool.md`

**Import :**
```python
from crewai_tools import CSVSearchTool
```

**Signatures :**
```python
CSVSearchTool(csv: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour données utilisateur en CSV (exports Notion, spreadsheets).

---

### DirectoryReadTool
**Lien :** `/en/tools/file-document/directoryreadtool.md`

**Import :**
```python
from crewai_tools import DirectoryReadTool
```

**Signatures :**
```python
DirectoryReadTool(directory: str = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour explorer structure fichiers.

---

### DirectorySearchTool
**Lien :** `/en/tools/file-document/directorysearchtool.md`

**Import :**
```python
from crewai_tools import DirectorySearchTool
```

**Signatures :**
```python
DirectorySearchTool(directory: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** OUI — Excellent pour explorer documents locaux utilisateur. Intégrer pour recherche mémoire locale (notes, archives emails exportées).

---

### DOCXSearchTool
**Lien :** `/en/tools/file-document/docxsearchtool.md`

**Installation :** `uv pip install docx2txt 'crewai[tools]'`

**Import :**
```python
from crewai_tools import DOCXSearchTool
```

**Signatures :**
```python
DOCXSearchTool(docx: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour documents Word (contrats, rapports).

---

### FileReadTool / FileWriterTool
**Liens :** `filereadtool.md`, `filewritetool.md`

**Imports :**
```python
from crewai_tools import FileReadTool, FileWriterTool
```

**Signatures :**
```python
FileReadTool(file_path: str = None)
FileWriterTool()._run(filename: str, content: str, directory: str = None)
```

**Pertinence Daily Chief of Staff :** OUI — Basique, indispensable pour I/O fichiers locaux, configs, logs, sauvegarde rapports.

---

### JSONSearchTool
**Lien :** `/en/tools/file-document/jsonsearchtool.md`

**Import :**
```python
from crewai_tools import JSONSearchTool
```

**Env vars :** `CREWAI_TOOLS_ALLOW_UNSAFE_PATHS=true` (optionnel)

**Signatures :**
```python
JSONSearchTool(json_path: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour données structurées JSON.

---

### MDXSearchTool
**Lien :** `/en/tools/file-document/mdxsearchtool.md`

**Import :**
```python
from crewai_tools import MDXSearchTool
```

**Signatures :**
```python
MDXSearchTool(mdx: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** OUI — Excellent pour documentation personnelle, notes Markdown.

---

### OCRTool
**Lien :** `/en/tools/file-document/ocrtool.md`

**Import :**
```python
from crewai_tools import OCRTool
```

**Signatures :**
```python
OCRTool().run(image_path_url: str)
```

**Pertinence Daily Chief of Staff :** À évaluer — OCR captures/scans pièces jointes Gmail.

---

### PDFTextWritingTool
**Lien :** `/en/tools/file-document/pdf-text-writing-tool.md`

**Signatures :**
```python
PDFTextWritingTool().run(pdf_path, text, position, font_size=12, page_number=0)
```

**Pertinence Daily Chief of Staff :** NON — Trop spécialisé (annotation PDF).

---

### PDFSearchTool
**Lien :** `/en/tools/file-document/pdfsearchtool.md`

**Import :**
```python
from crewai_tools import PDFSearchTool
```

**Env vars :** `OPENAI_API_KEY`

**Signatures :**
```python
PDFSearchTool(pdf: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** OUI — Très utile. Lire pièces jointes PDF (contrats, factures, rapports). Intégrer avec Gmail integration pour scanner attachements.

---

### TXTSearchTool
**Lien :** `/en/tools/file-document/txtsearchtool.md`

**Import :**
```python
from crewai_tools import TXTSearchTool
```

**Signatures :**
```python
TXTSearchTool(txt: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** OUI — Basique, indispensable pour recherche notes texte.

---

### XMLSearchTool
**Lien :** `/en/tools/file-document/xmlsearchtool.md`

**Pertinence Daily Chief of Staff :** NON — XML niche.

---

## Search & Research Tools

### ArxivPaperTool
**Lien :** `/en/tools/search-research/arxivpapertool.md`

**Pertinence Daily Chief of Staff :** NON — Trop académique.

---

### Brave Suite (Web, News, Image, Video, POIs, LLMContext)
**Lien :** `/en/tools/search-research/bravesearchtool.md`

**Imports :**
```python
from crewai_tools import (
    BraveWebSearchTool, BraveNewsSearchTool, BraveImageSearchTool,
    BraveVideoSearchTool, BraveLocalPOIsTool, BraveLLMContextTool
)
```

**Env vars :** `BRAVE_API_KEY`

**Signatures :**
```python
BraveWebSearchTool(api_key=None, requests_per_second=1.0, raw=False)
tool.run(q: str, count: int = 10, country: str = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Alternative Tavily/Exa.

---

### CodeDocsSearchTool
**Lien :** `/en/tools/search-research/codedocssearchtool.md`

**Pertinence Daily Chief of Staff :** NON — Dev-oriented, hors scope.

---

### DatabricksQueryTool
**Lien :** `/en/tools/search-research/databricks-query-tool.md`

**Pertinence Daily Chief of Staff :** NON — Enterprise niche.

---

### ExaSearchTool
**Lien :** `/en/tools/search-research/exasearchtool.md`

**Import :**
```python
from crewai_tools import ExaSearchTool
```

**Env vars :** `EXA_API_KEY`

**Signatures :**
```python
ExaSearchTool(type: str = "auto", highlights: bool = True, content: bool = False)
tool.run(search_query: str, start_published_date: str = None)
```

**Mini snippet :**
```python
exa_tool = ExaSearchTool(type="auto", highlights=True)
results = exa_tool.run("latest GPT updates", start_published_date="2024-01-01")
```

**Pertinence Daily Chief of Staff :** OUI — Déjà dans .env.local (EXA_API_KEY). Excellent pour recherche web high-quality, highlights token-efficaces.

---

### GithubSearchTool
**Lien :** `/en/tools/search-research/githubsearchtool.md`

**Pertinence Daily Chief of Staff :** NON — GitHub exploration dev-oriented.

---

### LinkupSearchTool
**Lien :** `/en/tools/search-research/linkupsearchtool.md`

**Pertinence Daily Chief of Staff :** À évaluer — Alternative Exa/Tavily.

---

### SerpApiGoogleSearchTool / SerpApiGoogleShoppingTool
**Liens :** `serpapi-googlesearchtool.md`, `serpapi-googleshoppingtool.md`

**Env vars :** `SERPAPI_API_KEY`

**Pertinence Daily Chief of Staff :** À évaluer pour Search (free tier bon pour prototype). NON pour Shopping.

---

### SerperDevTool
**Lien :** `/en/tools/search-research/serperdevtool.md`

**Import :**
```python
from crewai_tools import SerperDevTool
```

**Env vars :** `SERPER_API_KEY`

**Signatures :**
```python
SerperDevTool(n_results: int = 10, country: str = None, locale: str = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Alternative cheap Google search.

---

### TavilyExtractorTool
**Lien :** `/en/tools/search-research/tavilyextractortool.md`

**Installation :** `uv add 'crewai[tools]' tavily-python`

**Import :**
```python
from crewai_tools import TavilyExtractorTool
```

**Env vars :** `TAVILY_API_KEY`

**Signatures :**
```python
TavilyExtractorTool(extract_depth: Literal["basic", "advanced"] = "basic", include_images: bool = False)
tool.run(urls: str | list)
```

**Pertinence Daily Chief of Staff :** OUI — Déjà dans .env.local (TAVILY_API_KEY). Extraire contenu URLs, articles, web pages.

---

### TavilyResearchTool
**Lien :** `/en/tools/search-research/tavilyresearchtool.md`

**Import :**
```python
from crewai_tools import TavilyResearchTool
```

**Env vars :** `TAVILY_API_KEY`

**Signatures :**
```python
TavilyResearchTool(model: str = "auto", citation_format: str = "numbered")
tool.run(input: str)
```

**Pertinence Daily Chief of Staff :** OUI — Rapports synthesisés + citations excellents pour Chief of Staff.

---

### TavilySearchTool
**Lien :** `/en/tools/search-research/tavilysearchtool.md`

**Import :**
```python
from crewai_tools import TavilySearchTool
```

**Env vars :** `TAVILY_API_KEY`

**Signatures :**
```python
TavilySearchTool(search_depth: str = "basic", max_results: int = 5)
tool.run(query, topic="general", include_answer=True, include_raw_content=False)
```

**Mini snippet :**
```python
tavily_search = TavilySearchTool(search_depth="advanced", max_results=10)
results = tavily_search.run("AI investment trends", topic="finance", include_answer=True)
```

**Pertinence Daily Chief of Staff :** OUI — Déjà dans .env.local. Principal search engine. Support deep search + topical filtering (news/finance).

---

### WebsiteSearchTool
**Lien :** `/en/tools/search-research/websitesearchtool.md`

**Import :**
```python
from crewai_tools import WebsiteSearchTool
```

**Signatures :**
```python
WebsiteSearchTool(website: str = None, config: dict = None)
```

**Pertinence Daily Chief of Staff :** À évaluer — Utile pour explorer sites favoris (blogs, news).

---

### YoutubeChannelSearchTool / YoutubeVideoSearchTool
**Liens :** `youtubechannelsearchtool.md`, `youtubevideosearchtool.md`

**Pertinence Daily Chief of Staff :** NON — Trop niche pour V1.

---

### You.com Search & Research (you-search / you-research)
**Lien :** `/en/tools/search-research/youai-search.md`

**Installation :** `pip install "crewai-tools[mcp]>=0.1"`

**Imports :**
```python
from crewai import Agent
from crewai.mcp import MCPServerHTTP
```

**Signatures :**
```python
Agent(mcps=[MCPServerHTTP(url="https://api.you.com/mcp?profile=free")])
```

**Pertinence Daily Chief of Staff :** À évaluer — Free tier excellent pour prototype.

---

## Synthèse tools sélectionnés pour Daily Chief of Staff (Part A)

### Tier 1 — Essentiels (must-have V1)

1. **RagTool** (AI/ML) — Knowledge base polyvalente, cœur du Chief of Staff.
2. **TavilySearchTool** (Search) — Recherche web principale (déjà .env.local).
3. **ExaSearchTool** (Search) — Alternatif/complémentaire (déjà .env.local).
4. **PDFSearchTool** (File) — Analyse pièces jointes Gmail, contrats.
5. **FileReadTool + FileWriterTool** (File) — I/O fichiers locaux.
6. **DirectorySearchTool** (File) — Exploration mémoire utilisateur.
7. **E2BPythonTool** (AI/ML) — Exécution code sécurisée (déjà .env.local).
8. **NL2SQLTool** (Database) — Requêtes naturelles Supabase Postgres.

### Tier 2 — Importants (V2)

9. **TavilyResearchTool** — Rapports synthesisés + citations.
10. **TavilyExtractorTool** — Extraction contenu structuré URLs.
11. **MDXSearchTool / TXTSearchTool** — Compléments DirectorySearchTool.
12. **PGSearchTool** ou **QdrantVectorSearchTool** — Vector search mémoire long terme.

### Tier 3 — Optionnels

- **CSVSearchTool** — Si gestion budgets/dépenses en CSV.
- **OCRTool / VisionTool** — OCR captures.
- **DOCXSearchTool / JSONSearchTool** — Formats spécifiques.

### À exclure

- **CodeInterpreterTool** (deprecated) → E2BPythonTool.
- **DallETool** — Hors scope.
- **BedrockKBRetrieverTool, SingleStore, Snowflake, MongoDB** — Enterprise/niche.
- **Databricks, AIMind, GitHub, ArXiv, Shopping, YouTube** — Trop spécialisé.
- **PDFTextWritingTool** — Annotation PDF hors scope.
