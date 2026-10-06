# Reviewing the verification challenge patch

Read in this order:

1. `accounts/models.py`: purposes, fields, and partial uniqueness constraints.
2. `accounts/services/challenges.py`: creation, expiry, status, resends, closure.
3. `accounts/api/verification.py`: signup, email/password changes, recovery,
   confirmation, and purpose-bound completion-token validation.
4. `accounts/tasks.py`: queued recovery delivery, retry, and stale-job protection.
5. `accounts/api/views.py`: login and token/session handling.
6. `venues/api/verification.py`: venue proof issuance and application consumption.
7. Frontend verification utilities, ProfilePage/EmailVerificationModal,
   VerifyEmailPage/PasswordResetPage, LoginPage, and ApplyVenuePage.
8. Migrations 0011–0013, then backend and frontend regression tests.

Supporting auth/caller changes are included so this commit builds independently.
Venue search/filter work is excluded. HTML adapters keep imports and existing
routes working, but legacy HTML security policy is outside this review's scope.

Apply migrations and deploy the backend/frontend together. Restart Celery workers
and Beat; recovery delivery requires a running broker and worker. Do not enable
Celery eager mode in production. Migration 0013 renames a column, so coordinate
deployment with any already-running challenge implementation.

`/api/token/` now follows the protected login response contract: an HttpOnly
refresh cookie and possible email verification challenge, rather than a JSON refresh token.
Existing legacy pending verification state is not migrated and must be restarted.

Validation from the isolated commit contents: 19 frontend tests and production
build passed; 70 backend tests passed on SQLite, with four PostgreSQL concurrency
tests skipped. Prior PostgreSQL validation covered concurrency and migration
round trips before the queued recovery delivery follow-up.

Remaining limitations: normalized account email uniqueness is not enforced by
the database; background recovery removes SMTP wait but does not promise identical
timing for all accounts. Legacy login routes retain their prior policies.
