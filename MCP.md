# MCP Powered Data Analyst - Technical Interview Preparation (AstraZeneca)

## Scope Note
This document intentionally covers only the MCP project present in this workspace.

## 1) End-to-End Workflow (UI -> Backend -> MCP/Python -> Response)

### A. User Upload Flow
1. User opens the web UI and selects a CSV file.
2. Frontend sends the file to `POST /api/upload` as `multipart/form-data`.
3. Node.js backend validates file type and size (CSV, up to 50MB), stores it in `backend/uploads`, and creates a file mapping in memory (`activeDatasetsMap`).
4. Backend returns `filePath`, `fileId`, and metadata to the frontend.
5. Frontend stores `currentDatasetPath` for future chat requests.

### B. User Question Flow
1. User asks a question in chat.
2. Frontend sends `POST /api/chat` with `message` and `datasetPath`.
3. Backend validates request payload and checks file existence.
4. Backend calls MCP client (`mcpClient.analyzeDataset`) to:
   - read dataset summary,
   - classify user intent (chart vs text),
   - generate chart data or text analysis using Python-driven data ops plus Gemini-assisted interpretation.
5. Backend constructs a prompt for Gemini with dataset details + MCP analysis context and requests a natural-language answer.
6. Backend returns JSON response:
   - `response` (assistant text),
   - `chartData` (if visual requested),
   - `textAnalysis` (if generated).
7. Frontend renders assistant message; when `chartData` exists, it renders chart UI (canvas/plot container) and visual output.

### C. MCP/Python Execution Path
1. Node backend uses MCP client (`backend/mcpClient.js`) to coordinate analysis.
2. Python MCP server (`src/mcp_server_ds/server.py`) exposes tools:
   - `load_csv`
   - `run_script`
3. Server loads data into in-memory DataFrames and executes targeted analysis scripts with pandas/numpy/scipy/sklearn/statsmodels context.
4. Tool output is returned as MCP text content and transformed by backend for user-facing response.

## 2) Technical Deep-Dive

### Why MCP for this project
- **Protocolized tool access**: MCP provides a structured way to expose data-analysis capabilities (`load_csv`, `run_script`) to higher-level orchestration.
- **Separation of concerns**: The web/API layer focuses on UX and request handling; analytical computation is delegated to Python tools.
- **Extensibility**: New tools (forecasting, anomaly detection, feature engineering) can be added without redesigning frontend contracts.
- **Model-agnostic orchestration**: LLM layer can evolve independently while analysis tools stay stable.

### Why Python for the analysis tier
- **Best-in-class data ecosystem**: pandas, numpy, scipy, sklearn, statsmodels reduce implementation complexity for EDA and statistics.
- **Fast experimentation**: easier to prototype and validate analytical logic.
- **Industry familiarity**: strong fit for data-science interview expectations in pharma/R&D environments.

### Advantages of a modular, distributed architecture
- **Independent scaling**: API tier and compute tier can scale differently.
- **Fault isolation**: a failure in analysis tooling does not necessarily crash the entire UI/API plane.
- **Replaceable components**: you can swap LLM providers or analysis engines with less blast radius.
- **Operational clarity**: clearer ownership boundaries for frontend, API, AI orchestration, and compute.

## 3) ATOLA "Thinking" Stories (MCP Project)

### Challenge 1: Ambiguous user intent (chart request vs text insight)
- **Action**: Implemented intent analysis in backend flow so queries are classified before running expensive analysis.
- **Thinking**: If every request triggers chart generation, latency and irrelevant outputs increase. Intent-first routing improves relevance and cost profile.
- **Outcome**: More accurate responses; users get chart output only when needed.
- **Learnings**: Natural language requests are often ambiguous; deterministic fallback logic is essential.
- **Application**: In AstraZeneca-scale systems, I would use telemetry-driven intent calibration and A/B testing for prompt + routing quality.

### Challenge 2: Safe and stable script execution over arbitrary datasets
- **Action**: Restricted execution context and constrained tools to focused analytics operations (`load_csv`, `run_script`) with controlled data memory behavior.
- **Thinking**: Flexibility is valuable, but unbounded execution introduces reliability and security risk. Controlled interfaces preserve power while reducing exposure.
- **Outcome**: Practical analytics capability with predictable behavior.
- **Learnings**: Tool contract design is as important as model quality.
- **Application**: For enterprise use, I would add stricter sandboxing, timeouts, and policy checks before script execution.

### Challenge 3: Balancing LLM quality with deterministic data correctness
- **Action**: Combined deterministic dataset profiling/correlation flow with LLM-generated narrative interpretation.
- **Thinking**: LLMs are strong for explanation, weaker for guaranteed numeric correctness without grounding. So compute first, narrate second.
- **Outcome**: Responses remain insightful while anchored to actual computed results.
- **Learnings**: Hybrid design (deterministic analytics + generative explanation) produces better trust.
- **Application**: In regulated settings, I would add result provenance, confidence signals, and auditable analysis traces.

## 4) Edge Cases, Security, and Scalability Risks (Global Enterprise Context)

### Key Risks
- **Path traversal / arbitrary file access**: `datasetPath` sent from client can be abused if not strictly constrained to upload directory.
- **Untrusted code execution risk**: any script execution surface can be exploited if policy boundaries are weak.
- **Prompt injection through CSV content**: malicious cell values can steer LLM behavior.
- **In-memory state limits**: `activeDatasetsMap` and DataFrames in process memory do not scale for many concurrent users.
- **Single-process bottlenecks**: Node and Python local process model limits throughput.
- **Data privacy/compliance**: uploaded CSVs may include sensitive patient or operational data.

### Enterprise-Grade Mitigations
- **Strict file isolation**: resolve and validate canonical paths; use opaque dataset IDs rather than trusting client-provided paths.
- **Execution sandboxing**: isolate Python execution in hardened containers with CPU/memory/time quotas and network restrictions.
- **Prompt/data sanitization layer**: escape or filter high-risk tokens from data before model prompts; use policy-based prompt templates.
- **Persistent metadata store**: move in-memory maps to a managed datastore and object storage.
- **Queue-based async architecture**: route heavy analysis to workers (job queue) with status polling/webhooks.
- **Observability and governance**: centralized logs, distributed tracing, model usage metrics, and audit trails.
- **Security controls**: authN/authZ, encryption in transit/at rest, secrets vaulting, retention/deletion policies, DLP scanning.

## 5) Mock Values-Based Technical Questions (AstraZeneca Style)

1. Tell me about a time you took a smart risk in your architecture choices. Why did you choose MCP with a Python analytics tier instead of a single-stack implementation?
2. Describe a situation where user experience and system safety were in tension (for example, dynamic analysis scripts). How did you decide what to allow or restrict?
3. Give an example of when you improved trust in AI-assisted outputs. How did you ensure that explanations were grounded in real computed data?
4. Share a time you designed for scale before traffic arrived. What architectural decisions in this project prepared it for enterprise growth?
5. Tell me about a technical decision you would revisit now. What did you learn, and how would you apply that learning in a regulated healthcare environment?

## Short Interview Pitch (60-90 seconds)
I built an MCP-powered data analyst system that lets users upload CSV datasets, ask natural-language questions, and receive grounded analytical insights with optional visualizations. The frontend handles ingestion and chat UX, the Node backend orchestrates requests, and the Python MCP server executes deterministic analytics using pandas/scipy/sklearn tools. I chose this modular architecture to separate interaction, orchestration, and compute concerns, which improves extensibility and operational control. I also designed fallback behavior when advanced services are unavailable and focused on balancing model fluency with deterministic data correctness. If scaling this for a global enterprise, I would harden execution sandboxing, enforce strict data governance, and move to queue-based distributed workers with full observability and auditability.
