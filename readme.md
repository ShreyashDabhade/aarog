docker run -p 6379:6379 redis

# Backend (run from repo root)
cd backend

# Activate venv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# run Celery from `backend`
celery -A app.tasks:celery_app worker --loglevel=info --pool=solo

# In a second terminal
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
