FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN DJANGO_DEBUG=true DJANGO_SECRET_KEY=build-only-secret python manage.py collectstatic --noinput
RUN addgroup --system django && adduser --system --ingroup django django \
    && mkdir -p /app/media /app/staticfiles \
    && chown -R django:django /app
USER django

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
