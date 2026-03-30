# SecureMed

SecureMed is a privacy-first medical record vault with an AI assistant on top. Patients can upload reports, keep the original file encrypted for personal access, create an anonymized AI-safe copy for search and analysis, and selectively share access with doctors using temporary session codes.

The project is split into:

- A React frontend for registration, login, OCR, anonymization, encryption, record sharing, and chat
- A FastAPI backend for auth, record storage, doctor/patient access control, and AI query orchestration
- A Celery worker that decrypts the anonymized copy and indexes it into ChromaDB
- PostgreSQL for user/report metadata
- Redis for Celery and short-lived doctor sharing sessions

## Why this project is interesting

This app uses a dual-path document flow:

1. The original report is encrypted in the browser with a patient-controlled AES key and stored for later viewing.
2. A separate anonymized text version is encrypted for the server and sent to the worker.
3. The worker decrypts only the anonymized copy, chunks it, embeds it, and stores it in ChromaDB for retrieval.
4. The AI assistant answers questions from that indexed knowledge base instead of directly exposing raw private files.

In plain English: the vault copy stays encrypted for the patient, while the AI works from a stripped-down anonymized version.

## What users can do

### Patient flow

- Create an encrypted vault account
- Generate an RSA key pair in the browser
- Keep the private key encrypted with the account password
- Upload scanned medical files
- Run OCR locally in the browser with `tesseract.js`
- Review and edit anonymized text before upload
- Store the original file in encrypted form
- Share report access with a doctor using a 6-digit temporary session code
- Ask AI questions about their own uploaded records

### Doctor flow

- Create a doctor account
- Generate a temporary share code for patients
- Receive access only to reports explicitly shared by patients
- Decrypt and view shared files in the browser
- Ask AI questions about a selected patient
- Use global research mode against the anonymized knowledge base

## How the system is organized

```text
frontend/
  src/pages/           UI flows: login, register, upload, dashboard, chat
  src/lib/crypto.js    Browser-side crypto helpers
  src/ner_service.js   Local anonymization pipeline

backend/
  app/main.py          FastAPI app and API routes
  app/routers/auth.py  Register/login endpoints
  app/tasks.py         Celery worker for decrypt + index
  app/retrieval.py     ChromaDB + embedding logic
  app/agent_runner.py  LangChain-based AI query runner
  app/models.py        SQLAlchemy models
  generate_keys.py     Generates backend RSA key pair
```

## Tech stack

- Frontend: React, Vite, Tailwind CSS, Zustand, Framer Motion
- Browser AI/processing: `tesseract.js`, `@xenova/transformers`, `compromise`
- Backend: FastAPI, SQLAlchemy, Celery
- Storage: PostgreSQL, ChromaDB
- Queue/session store: Redis
- AI/RAG: Sentence Transformers, LangChain, Gemini via `langchain-google-genai`

## Before you run it

You will need:

- Node.js 18+ and npm
- Python 3.10+
- Docker Desktop or local Redis/PostgreSQL installs
- A Google API key if you want the AI chat to work

Recommended local ports used by the current code:

- Frontend: `5173`
- Backend API: `8000`
- Redis: `6379`
- PostgreSQL: `5433` on your machine, mapped to container `5432`

## Quick start

Follow these steps in order. Open each long-running service in its own terminal.

### 1. Start Redis

From the project root:

```powershell
docker compose up -d
```

This uses the included `docker-compose.yml` and starts Redis on `localhost:6379`.

### 2. Start PostgreSQL

The backend defaults to:

```env
DATABASE_URL=postgresql://admin:secret@localhost:5433/med_privacy_db
```

To match that without changing code, run:

```powershell
docker run --name med-postgres `
  -e POSTGRES_USER=admin `
  -e POSTGRES_PASSWORD=secret `
  -e POSTGRES_DB=med_privacy_db `
  -p 5433:5432 `
  -d postgres
```

If you already have PostgreSQL running somewhere else, that is fine too. Just update `DATABASE_URL` in `backend/.env`.

### 3. Create the backend environment file

Create `backend/.env` with values like these:

```env
DATABASE_URL=postgresql://admin:secret@localhost:5433/med_privacy_db
SECRET_KEY=change_this_to_a_long_random_secret
CELERY_BROKER_URL=redis://localhost:6379/0
GOOGLE_API_KEY=your-google-api-key
SERVER_PRIV_KEY_PATH=docs/server_privkey.pem
SERVER_PUB_KEY_PATH=docs/server_pubkey.pem
LLM_MODEL=gemini-2.5-flash
```

Notes:

- `GOOGLE_API_KEY` is required for the chat assistant.
- If you only want to test auth/upload/share flows, you can leave `GOOGLE_API_KEY` empty, but chat will fail.
- The frontend already defaults to `http://localhost:8000`, so a frontend env file is optional.

### 4. Generate backend RSA keys

From the `backend` folder:

```powershell
python generate_keys.py
```

This creates:

- `backend/docs/server_privkey.pem`
- `backend/docs/server_pubkey.pem`

### 5. Install backend dependencies

From the `backend` folder:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

If you are on macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 6. Start the Celery worker

From the `backend` folder:

```powershell
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
```

Keep this terminal open.

### 7. Start the backend API

From the `backend` folder:

```powershell
uvicorn app.main:app --reload --port 8000
```

Once it starts, the API is available at:

- `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

### 8. Install and start the frontend

From the `frontend` folder:

```powershell
npm install
npm run dev
```

Open the URL shown by Vite, usually:

- `http://localhost:5173`

## First end-to-end demo

If you want the quickest happy-path test, use this order:

1. Register a patient account.
2. Log in with the patient account.
3. Upload a medical file.
4. Wait for OCR, review the anonymized text, then complete upload.
5. Register a separate doctor account in another browser or incognito window.
6. Log in as the doctor and generate a 6-digit session code.
7. Go back to the patient dashboard, open report sharing, and enter that code.
8. Return to the doctor dashboard and open the shared file.
9. Use chat as the patient or doctor to query indexed medical content.

## What happens during upload

The upload flow is easier to understand if you think of it as four stages:

1. The file is selected in the browser.
2. OCR extracts text locally.
3. The text is anonymized locally and shown for review.
4. Two encrypted payloads are created:
   - The original file is encrypted for patient access.
   - The anonymized text is encrypted for the backend worker and AI indexing.

That means the AI pipeline never needs the original unredacted document to answer text questions.

## Environment variables that matter most

### Backend

- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: JWT signing key
- `CELERY_BROKER_URL`: Redis URL for Celery and session codes
- `GOOGLE_API_KEY`: required for Gemini-backed chat
- `SERVER_PRIV_KEY_PATH`: backend private key path
- `SERVER_PUB_KEY_PATH`: backend public key path
- `LLM_MODEL`: optional, defaults to `gemini-2.5-flash`

### Frontend

- `VITE_API_URL`: optional, defaults to `http://localhost:8000`

If you want to set it explicitly, create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8000
```

## Important behavior to know

- The backend should be started from inside the `backend` folder. That is where the `.env` file and `docs/` key paths are expected.
- The first OCR/anonymization run can feel slow because browser-side models may need to load.
- The first indexing/search run can also be slow because sentence-transformer embeddings are loaded on demand.
- The doctor and patient private keys are kept in browser memory after login. If the UI says the key is missing, log in again.
- `docker-compose.yml` only starts Redis. PostgreSQL still needs to be started separately unless you extend the compose file.

## Troubleshooting

### Backend cannot connect to Postgres

Check that:

- PostgreSQL is running
- The host port matches the `DATABASE_URL`
- You used `5433:5432` if you want to keep the current default config unchanged

### Upload succeeds but chat is empty

Check that:

- The Celery worker is running
- Redis is running
- The worker was able to decrypt and index the anonymized text

### Chat returns a system error

Most likely causes:

- `GOOGLE_API_KEY` is missing
- The selected LLM model is unavailable
- The document has not been indexed yet

### The app feels slow on first use

That is expected the first time:

- The frontend may download the browser anonymization model
- The backend may load the embedding model for Chroma indexing

## Current limitations

- The AI chat is the most complete part of the assistant flow for text questions.
- The agent prompt references chart/vitals behavior, but the current codebase is mainly wired for text retrieval and question answering.
- There are older backend folders in the repo, but the active app entrypoint is `backend/app/main.py`.

## Useful commands

### Start Redis

```powershell
docker compose up -d
```

### Start backend worker

```powershell
cd backend
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
```

### Start backend API

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

### Start frontend

```powershell
cd frontend
npm run dev
```

## Summary

SecureMed is a full-stack prototype for privacy-aware medical record handling. It combines browser-side encryption, OCR, anonymization, doctor-patient sharing, vector search, and LLM-based querying into one workflow that is surprisingly practical to demo locally once Redis, Postgres, the backend keys, and the worker are all running.
