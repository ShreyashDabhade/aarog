docker run -p 6379:6379 redis

cd backend
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

cd backend
uvicorn app.main:app --reload --port 8000
 
cd frontend
npm run dev