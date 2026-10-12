# GPLX REST API (backend)

Django 5.2 / Django REST Framework API, JWT authentication and MySQL support, with WhiteNoise-served collected static assets. All project files and commands in this README are scoped to this `backend` directory.

## Data integrity and limitations

The supplied `600_cau_hoi.json` was inspected as a JSON array containing 600 rows with source `id`, `chapter`, `chapter_name`, question, answer keys, and a numeric correct-answer key. Source IDs are preserved as `question_number`; chapter names are retained exactly; answer keys are stored as their source numeric strings. The 318 non-null image references match the supplied `images/q_<id>.jpg` naming convention.

This establishes that the file is structurally usable; it does **not** authenticate its legal currency or answer correctness against an official 2025 source. In the supplied JSON all 600 `is_critical` values are `null`; there is no explanation text, license-class assignment, or exam-rule configuration. The importer preserves null critical status and does not infer critical questions, explanations, or license eligibility. No default exam is generated: an administrator must verify and curate questions into a license class and create a versioned exam configuration before sessions can start. In particular, validate the 2025 exam rules against an authoritative source before production use.

The source JSON and ZIP are intentionally kept outside this directory and are not copied into the image. The import command reads those supplied files directly and extracts only referenced images into configured media storage.

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

`--dry-run` validates the entire source and referenced JPEGs and reports likely create/update/skip counts without changing the database or media. Invalid input aborts before database changes. A valid import is atomic and repeatable. The command updates source rows and answer options, while clearing license assignments because none are present in the source.

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

Schedule `python manage.py expire_exam_sessions` at least once per minute in production to auto-submit expired sessions even if the client has stopped polling; API reads and answer writes also enforce the deadline synchronously.

Exam configurations and license classes are managed in Django admin after source curation. Each question must be explicitly associated with its eligible license class; the importer deliberately leaves that relation empty.

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

The Django image is ready to be used as the API service alongside a MySQL service.

## Tests and migrations

```powershell
python manage.py makemigrations accounts question_bank exams
python manage.py migrate
python manage.py test
```

The project migrations are committed. Tests use Django's test runner and the configured database; migrations target the MySQL deployment database.
