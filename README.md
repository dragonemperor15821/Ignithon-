# CaseForge

Digital Evidence Intelligence & Incident Reconstruction.

Evidence → Extraction → Timeline → Missing Info → Contradictions → PII Redaction → Incident Report

## Backend (FastAPI, port 8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: http://127.0.0.1:8000/api/health

## Frontend (React + Vite + Tailwind, port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — `/api/*` is proxied to the backend.
