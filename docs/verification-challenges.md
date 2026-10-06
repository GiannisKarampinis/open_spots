# Account verification challenges

Signup, email changes, password changes, password recovery and the
venue-email verification API now use `accounts.VerificationChallenge`.
Ordinary login sessions, refresh tokens, visit tracking and legacy venue Django
form verification remain separate.

## Request flow

1. The start endpoint returns `challenge_id` (a random UUID bearer credential).
2. Send `X-Verification-Challenge: <id>` to status, confirm, resend and cancel.
   POST callers can alternatively include `challenge_id` in their body.
3. Confirmation requires that challenge's emailed code. Codes are hashed in the
   database, expire after 10 minutes, and are consumed once.
4. Password recovery confirmation returns a separate random `reset_token`.
   Password reset requires both the challenge ID and this token, expires within
   10 minutes, and consumes them atomically.

`GET /api/v1/accounts/verification/current/` requires authentication and restores
only the current user's active challenge. Public status requires an explicit ID.
Do not place IDs or reset tokens in URLs, analytics, or logs.

React keeps credentials in tab-local `sessionStorage` (browser storage, not a
Django session). Each verification component captures its ID so another flow
cannot silently change its request target. HTML forms use opaque HttpOnly cookies
for navigation and hidden fields to bind rendered forms to their challenge.

## One active flow per user

A database constraint and user-row locks enforce one open account-verification
challenge per user. Ordinary login does not create a verification challenge for
an already verified account.
Starting a different flow returns 409. Use the pending verification UI to continue
or cancel it. Expired challenges are closed when a new one starts. Repeating the
same email request with its ID resumes it without sending another code; login with
valid credentials can resume signup verification. Signup no longer deletes an
existing unverified account when a new signup is attempted.

For password recovery, unknown accounts and accounts with another active flow
receive decoy challenges with the same response shape; the active flow and its ID
are never disclosed to an unauthenticated caller. No email is sent for decoys.
A user blocked by another flow must finish/cancel that flow or wait for expiry.

Challenges last 30 minutes, except password-change challenges, which use
`PASSWORD_CHANGE_PENDING_SECONDS` (default 10 minutes). Resend renews only the code,
not the challenge lifetime. Attempts, locks, pending email/password data and
recovery authorization live in the challenge, not the session. Password or primary
email changes invalidate previously created challenges. Pending passwords are
stored as password hashes, and payloads are cleared on consumption/cancellation.

## Rollout and maintenance

`/api/token/` is now an alias of the protected account login endpoint. It uses
the login response contract, including email verification challenges and an
HttpOnly refresh cookie, instead of returning an unrestricted JWT pair.
Password recovery returns the same response on SMTP failure as for unknown
accounts, and rolls back the failed real challenge so retry remains possible.
Recovery delivery now runs through `accounts.tasks.deliver_recovery_code` after
transaction commit. Real and decoy recovery challenges both enqueue a task;
workers skip decoys. SMTP delivery retries three times with backoff. Workers skip
expired, closed, verified, or superseded codes, and close the challenge if retries
are exhausted. Broker enqueue failure also closes the challenge to allow retry.
Run Celery workers and the broker in production; keep task eager execution disabled.
This removes SMTP latency from recovery responses, not every possible timing signal.

Venue submission authorization errors include `verification_required`; React
discards expired credentials and allows reverification without clearing form data.

Apply `python manage.py migrate` before deploying the new API/frontend together.
Existing session-based pending verifications are not converted; users must start
them again. Old `EmailVerificationCode` records are no longer accepted by account
verification endpoints. The old model remains for migration compatibility.

Celery Beat schedules cleanup daily. Restart the workers and Beat with the new
code when deploying. You can also run `python manage.py purge_verification_challenges`
manually to remove expired/closed records, including decoy challenges. The command
does not remove active challenges. Other verification flows deliver synchronously;
password recovery initial sends and resends use the background worker described above.

Tests: `python manage.py test accounts --settings=openspots.settings_test` and
`npm test -- --runInBand` from `frontend`. The test settings use an in-memory
database, local cache and captured email; they do not send real emails.

## Venue application email

`/api/v1/venues/verification/send/` creates a `venue_email` challenge and returns its
ID. Passing that ID with the same email resends, subject to the 45-second cooldown,
email/IP rate limits, and persistent lockout. Different challenges have independent
hashed codes and cannot verify one another. These challenges have no user yet.

`/api/v1/venues/verification/confirm/` requires the ID and code, then returns a
random `verification_token`. `/api/v1/venues/apply/` requires the ID, token and the
same normalized admin email. Application creation and proof consumption are atomic;
invalid application data does not consume the proof. The proof expires with the
30-minute challenge. ApplyVenuePage keeps these credentials in component state;
editing the email discards them, and reloading starts a new verification.

Legacy `venue_*` Django session flags and old email-code records cannot authorize
these API endpoints. The legacy Django venue forms continue using their existing
implementation. Initial sends/resends are limited by
`API_THROTTLE_VENUE_SEND_EMAIL` (default 3/hour) and
`API_THROTTLE_VENUE_SEND_IP` (default 10/hour).
