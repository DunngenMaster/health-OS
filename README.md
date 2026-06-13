# HealthOS

Hospital operations intelligence platform for emergency scenario planning. Map incoming incidents to hospitals, run a multi-agent **Hospital OS** dashboard per facility, and simulate surge capacity with Gemini-powered recommendations.

## Features

- **Scenario map** — define incidents via a form (type, location text, patient counts); Gemini geocodes the location and routes patients to nearby hospitals on a Mapbox dashboard
- **Hospital OS** — per-hospital command center: capacity model, two-month operational digest, clinical evidence (Chroma RAG), physician/equipment intelligence, improvement roadmap
- **Scenario agent** — natural-language spec + patient sliders; proportional recommendations scaled to scenario severity (routine cases do not trigger surge hiring)
- **Gemini agents** — hospital routing, master recommendations, scenario synthesis, location geocoding (no rule-based fallbacks for agent outputs)

## Architecture

```
frontend (React + Vite + Mapbox)
    ↓ /api proxy
backend (FastAPI)
    ├── analyze-scenario / prepare-scenario
    ├── hospital-intelligence (NPI, CMS, OSM)
    ├── hospital-os/* (digest, RAG, scenario agent, enhance)
    └── Gemini + ChromaDB RAG
```

Synthetic data is limited to **uploaded scenario JSONs** and the **two-month hospital digest** (`incident_reports`, `patient_flow`, `hospital_log`). Everything else uses real profile sources plus Gemini.

## Prerequisites

- Node.js 20+
- Python 3.11+
- [Mapbox access token](https://account.mapbox.com/)
- [Google Gemini API key](https://aistudio.google.com/apikey)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd healthOs
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\pip install -r requirements.txt

# macOS / Linux
source venv/bin/activate
pip install -r requirements.txt
```

Copy the example env file and add your Gemini key:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Edit `backend/.env`:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the API:

```bash
# Windows
venv\Scripts\uvicorn app.main:app --reload --port 8000

# macOS / Linux
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
```

Copy the example env file:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Edit `frontend/.env`:

```
VITE_MAPBOX_TOKEN=your_mapbox_token_here
# Optional — leave unset in dev (Vite proxies /api to port 8000)
# VITE_API_BASE_URL=http://127.0.0.1:8000
```

Start the dev server:

```bash
npm run dev
```

Open http://localhost:5173

## Usage

1. **Map** — fill in the scenario form (e.g. building collapse, written address, patient counts) and click **Run scenario on map**
2. **Hospitals** — click a hospital marker to load intelligence; open **Hospital OS** for the full dashboard
3. **Scenario agent** — in Hospital OS, set patient counts and optional NL spec (e.g. `only one patient with fever`); run the agent pipeline for a downloadable report

## Key API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/analyze-scenario` | Geocode form input (if `location_name` provided) + hospital routing |
| `POST /api/v1/hospital-intelligence` | Collect hospital profile (NPI, CMS, OSM) |
| `POST /api/v1/hospital-os/digest` | Two-month operational digest |
| `POST /api/v1/hospital-os/rag-index` | Index digest into Chroma |
| `POST /api/v1/hospital-os/scenario-agent` | Multi-agent scenario report |
| `POST /api/v1/hospital-os/enhance` | Gemini master recommendations |

## Environment files

| File | Committed | Purpose |
|------|-----------|---------|
| `backend/.env.example` | Yes | Template for `GEMINI_API_KEY` |
| `frontend/.env.example` | Yes | Template for `VITE_MAPBOX_TOKEN` |
| `backend/.env` | **No** | Your secrets (gitignored) |
| `frontend/.env` | **No** | Your secrets (gitignored) |

## Project structure

```
healthOs/
├── backend/
│   ├── app/
│   │   ├── api/v1/routes.py
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── hospital_os/      # digest, scenario agent, orchestrator
│   │   │   ├── agents/           # intelligence collection agents
│   │   │   └── rag/              # Chroma RAG
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/           # MapDashboard, ScenarioForm, Hospital OS panels
│       ├── pages/
│       └── utils/
└── README.md
```

## Troubleshooting

- **`chromadb is required`** — run `pip install -r requirements.txt` inside `backend/venv`; restart uvicorn if install failed due to file locks
- **`404` on `/api/v1/prepare-scenario`** — restart backend cleanly; form flow uses `/analyze-scenario` with `location_name`
- **`GEMINI_API_KEY is required`** — ensure `backend/.env` exists and uvicorn was started after creating it
- **Map blank** — set `VITE_MAPBOX_TOKEN` in `frontend/.env`

## License

Private / project use — see repository owner for terms.
