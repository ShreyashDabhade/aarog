docker run -p 6379:6379 redis

docker run --name med-postgres -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=med_privacy_db -p 5432:5432 -d postgres

postgresql://admin:secret@localhost:5432/med_privacy_db

cd backend
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

cd backend
uvicorn app.main:app --reload --port 8000
 
cd frontend
npm run dev