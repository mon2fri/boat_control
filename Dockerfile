# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend:/app/docker \
    DJANGO_SETTINGS_MODULE=container_settings \
    DJANGO_DEBUG=false \
    BOAT_CONTROL_PORT=45303
WORKDIR /app
COPY pyproject.toml README.md ./
COPY backend/ ./backend/
RUN pip install --no-cache-dir . 'gunicorn>=23,<24' \
    && groupadd --gid 10001 boat \
    && useradd --uid 10001 --gid boat --create-home boat
COPY --from=frontend /build/frontend/dist/ ./frontend/dist/
COPY config/ ./config/
COPY .config ./default.config
COPY docker/ ./docker/
RUN mkdir -p /app/data && chown -R boat:boat /app
USER boat
EXPOSE 45303
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('BOAT_CONTROL_PORT', '45303') + '/api/health/', timeout=4)"]
ENTRYPOINT ["python", "/app/docker/entrypoint.py"]
