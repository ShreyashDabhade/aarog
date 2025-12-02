docker run -p 6379:6379 redis

celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

uvicorn app.main:app --reload

cd frontend
npm run devv    