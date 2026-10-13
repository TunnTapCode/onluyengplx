# GPLX REST API (backend)

Django 5.2 / Django REST Framework API, JWT authentication and MySQL support, with WhiteNoise-served collected static assets. All project files and commands in this README are scoped to this `backend` directory.

## Data integrity and limitations

The supplied `600_cau_hoi.json` was inspected as a JSON array containing 600 rows with source `id`, `chapter`, `chapter_name`, question, answer keys, and a numeric correct-answer key. Source IDs are preserved as `question_number`; chapter names are retained exactly; answer keys are stored as their source numeric strings. The 318 non-null image references match the supplied `images/q_<id>.jpg` naming convention.

This establishes that the file is structurally usable; it does **not** authenticate its legal currency or answer correctness against an official 2025 source. In the supplied JSON all 600 `is_critical` values are `null`; there is no explanation text, license-class assignment, or exam-rule configuration. The current MySQL question bank has 60 rows marked `is_critical=true`; those database flags, rather than null source values, drive critical-question practice and exam selection. Re-importing a source row with a null critical flag preserves its existing curated flag. No default exam is generated: an administrator must assign eligible questions to a license class and create a versioned exam configuration before sessions can start.

The source JSON and ZIP are intentionally kept outside this directory and are not copied into the image. The import command reads those supplied files directly and extracts only referenced images into configured media storage. The repository Docker Compose setup seeds its shared media volume from these bundled images and serves it through the frontend at `/media/`.

## Local development (PowerShell)

From this directory:

```powershell
Copy-Item .env.example .env
# Replace DJANGO_SECRET_KEY with a unique random value and set DATABASE_URL.
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The example environment connects to a local MySQL server using the `onluyen_gplx` database. Create the database and user in MySQL before running migrations. For Docker/production, set `DJANGO_DEBUG=false`, a unique secret, and a MySQL `DATABASE_URL`. URL-encode special characters in credentials used in a `DATABASE_URL`. The Compose configuration builds that URL from `MYSQL_USER` and `MYSQL_PASSWORD`, so use URL-safe values for those variables. In another terminal, import from the project root without copying files:

```powershell
python manage.py import_questions ..\600_cau_hoi.json --images-archive ..\images.zip --dry-run
python manage.py import_questions ..\600_cau_hoi.json --images-archive ..\images.zip
```

`--dry-run` validates the entire source and referenced JPEGs and reports likely create/update/skip counts without changing the database or media. Invalid input aborts before database changes. A valid import is atomic and repeatable. The command updates source rows and answer options; license assignments and other curated fields absent from the source are preserved.

For an unpacked image directory, use `--images-dir path\to\images`. JSON must be UTF-8 and follow the supplied source schema, not the illustrative normalized schema in the product prompt. Image entries are required for this dataset if any row references an image.

### Preparing another source release

When transcribing an official PDF, retain each source ID, chapter number/name, question and option wording exactly. Record `correct_answer` only after checking the official key, and represent `is_critical` as `true`, `false`, or `null` only when that fact is documented; do not derive explanations or license eligibility from chapter/topic. Verify the extracted JSON against the source PDF and key before import; OCR output alone is not verification. Use a JSON array with exactly the supplied source keys (`id`, `chapter`, `chapter_name`, `question`, nullable `image`, `answers` of numeric `key` and text, numeric `correct_answer`, nullable `is_critical`). Keep each source image as `images/q_<id>.jpg` in the archive (`q_<id>.jpg` in `--images-dir`). The importer checks exact IDs/keys, duplicate IDs, answer membership, referenced files and JPEG integrity before writing, then stores images under content-hashed names in `MEDIA_ROOT/questions/`. In production, configure durable media/object storage or a web-server route for `MEDIA_ROOT`; Django serves uploaded media only in development.

## API and administration

- API base: `/api/v1/`
- Swagger UI: `/api/docs/`
- OpenAPI schema: `/api/schema/`
- Django admin: `/admin/`
- JWT: `/api/v1/auth/register/`, `/login/`, `/token/refresh/`, `/logout/`, `/me/`, `/password/change/`

Question list/detail responses never contain correctness flags or correct answer keys. The practice answer endpoint discloses correctness only after a practice submission. Exam sessions store immutable question/configuration snapshots; answer writes accept only question and answer keys from that snapshot. Submission uses server-held answer keys, row locking/transactions and one result per session. Repeated submission returns the already-persisted result, and reads/answer writes after the server deadline trigger server-side finalization. Session and result access is owner-scoped.

Guests may browse and answer practice questions; guest answers are graded but are not written to `QuestionAttempt`. Guests may also take configured timed exams. Their in-progress answers are held in a temporary anonymous exam session; submission returns a signed result link without creating an `ExamResult` or keeping the session. Signed guest result links expire after 24 hours. Abandoned guest sessions are removed by `expire_exam_sessions`. Authenticated users retain saved practice progress and exam history. `GET /api/v1/study/statuses/?mode=full|critical`, `?mode=chapter&category=<category_id>`, or `?mode=full&license_class=<license_class_id>` returns each answered question's position and latest correctness in that practice set, so answer markers stay consistent when switching between the full bank, a chapter, or a license class. Authenticated learners can `POST /api/v1/study/reset/` with `{"mode":"full"}`, `{"mode":"full","license_class":<license_class_id>}`, `{"mode":"critical"}`, or `{"mode":"chapter","category":<category_id>}` to clear their saved attempts for active questions in that practice set before starting over; other users' attempts and progress outside that set are preserved.

Schedule `python manage.py expire_exam_sessions` at least once per minute in production to auto-submit expired sessions even if the client has stopped polling; API reads and answer writes also enforce the deadline synchronously.

The 15 license classes effective from 2025 are seeded in the `LicenseClass` table with descriptions and the Government Policy Portal source URL. Staff can manage exam configurations in the website at `/admin/exams` or in Django admin. The staff-only configuration API is `/api/v1/exams/configurations/` (create, update and delete); public clients may list and retrieve active configurations. `/api/v1/exams/admin-options/` supplies active license classes and eligible question counts for the management form. Staff must explicitly associate questions with eligible license classes; the importer leaves that relation to curation. Each active exam needs at least three active assigned questions marked `is_critical=true`, includes exactly three, and fails if any of those questions is answered incorrectly. A configuration may store `fixed_question_ids` as an ordered JSON array; each ID must refer to an active question assigned to the selected class, the array must match `question_count`, and it must contain exactly three critical questions. Fixed sets cannot be combined with a category distribution. Inactive draft configurations may leave duration and passing score unset; those values are required before activation.

To prepare 20 fixed B-class forms from the current 600-question bank, run `python manage.py configure_b_exam_forms --dry-run` and then `python manage.py configure_b_exam_forms`. The command assigns the active question bank to B without removing any other class assignments, partitions the 60 critical and 540 ordinary questions across 20 non-overlapping forms, and creates inactive drafts until the administrator sets the duration and passing score. Re-running with the same seed is safe; use `--seed` to select a different deterministic distribution. The website offers practice over the full 600-question bank, by chapter, and over questions marked critical. Configurations with existing sessions cannot be deleted and should be deactivated instead.

## MySQL / container

Configure `DATABASE_URL` for MySQL, `DJANGO_DEBUG=false`, a unique `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and CORS origins using `.env.example`. The repository-root Compose configuration creates and connects to the `onluyen_gplx` database. Set `DATABASE_SSL_REQUIRE=true` when the MySQL server requires TLS. For HTTPS deployments enable `SECURE_SSL_REDIRECT` and a suitable `SECURE_HSTS_SECONDS`; only trust forwarded-protocol headers from a proxy that strips client-supplied values. Build from this directory:

```powershell
docker build -t gplx-backend .
docker run --env-file .env -p 8000:8000 -v gplx-media:/app/media gplx-backend
```

Run migrations as a deployment step before starting workers:

```powershell
docker run --rm --env-file .env gplx-backend python manage.py migrate
```

The repository Compose setup shares the persistent `backend_media` volume with the frontend Nginx container, which serves images at `/media/`. When running the Vite development server, requests to `/media/` are proxied to the configured API host.

## Tests and migrations

```powershell
python manage.py makemigrations accounts question_bank exams
python manage.py migrate
python manage.py test
```

The project migrations are committed. Tests use Django's test runner and the configured database; migrations target the MySQL deployment database.
