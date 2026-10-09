# openSpots

## Layout

- `backend/`: Django apps, project configuration, migrations, requirements,
  shared static sources, translations, and the legacy template UI.
- `backend/<app>/tests.py` and `test_*.py`: current app tests.
- `backend/tests/`: cross-app tests; `scaffolding/` preserves older examples.
- `frontend/src/`: React application.
- `frontend/tests/unit/`: Jest tests; `frontend/tests/e2e/`: Playwright tests.
- `docs/`, `nginx/`, `prometheus/`: documentation and infrastructure.

## Development

Use Python 3.12 (matching Docker) and install `backend/requirements.txt` in a
virtual environment. Keep `.env` at the repository root; Django loads it when
run from either the repository root or `backend/`.

```sh
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver
```

For Docker development, run `docker compose up --build` at the repository root.
The backend source is mounted at `/app`; container static/media directories and
named volumes retain their existing locations. Local `media/` and `staticfiles/`
also retain their existing root locations. `MEDIA_ROOT` and `STATIC_ROOT` may be
overridden with environment variables.

Start React in a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

## Validation

```sh
python backend/manage.py check --settings=openspots.settings_test
cd backend
python manage.py test accounts venues emails_manager tests --settings=openspots.settings_test
cd ../frontend
npm test -- --runInBand
npm run build
npm run test:e2e
```

Playwright requires a running backend and its test users/fixtures. The existing
browser tests target Django template routes. Backend tests default to SQLite;
set `TEST_USE_POSTGRES=1` with PostgreSQL credentials for database concurrency
checks. CI uses PostgreSQL and the same Django test runner.
