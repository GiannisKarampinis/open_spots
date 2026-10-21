# openSpots

## Layout

- `backend/`: Django apps, project configuration, migrations, requirements,
  shared static sources, translations, and the legacy template UI.
- `backend/<app>/tests.py` and `test_*.py`: current app tests.
- `backend/tests/`: cross-app tests; `scaffolding/` preserves older examples.
- `frontend/src/`: React application.
- `frontend/tests/unit/`: Jest tests; `frontend/tests/e2e/`: Playwright tests.
- `nginx/`, `prometheus/`: infrastructure configuration.

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

Install the tracked pre-commit hook once per clone to run the local checks
automatically before every commit:

```sh
git config core.hooksPath .githooks
```

The hook runs Django system checks and tests, frontend Jest tests, and the
frontend production build. It blocks the commit if a check fails and writes the
latest Markdown report to `test-reports/pre-commit-latest.md`. Playwright E2E
tests are not run by the hook because they require a separately configured
backend and test fixtures; run them separately or use the CI workflow.

```sh
python backend/manage.py check --settings=openspots.settings_test
cd backend
python manage.py test accounts venues emails_manager tests --settings=openspots.settings_test
cd ../frontend
npm test -- --runInBand
npm run build
npm run test:e2e
```

Playwright runs against its own isolated Docker database and port so it does not
depend on or modify the normal development database. From `frontend/`, prepare
the stack and fixtures once:

```sh
npm run e2e:setup
```

Then run the browser tests or open Playwright UI:

```sh
npm run test:e2e -- --project=chromium
npm run test:e2e -- --ui --project=chromium
```

The E2E seed command is restricted to the isolated test mode. The existing
browser tests target Django template routes. Backend tests default to SQLite;
set `TEST_USE_POSTGRES=1` with PostgreSQL credentials for database concurrency
checks. CI uses PostgreSQL and the same Django test runner.

Playwright creates an HTML report under `frontend/playwright-report/` and opens
it automatically when the test run finishes. To open the most recent report
again, run `npx playwright show-report` from `frontend/`.
