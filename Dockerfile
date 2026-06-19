# ── Stage 1: build the React dashboard ───────────────────────────────────
# The compiled UI (minions/server/ui/dist) is gitignored, so we build it here
# rather than relying on it being present in the repo.
FROM node:20-slim AS ui
WORKDIR /ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
COPY ui/ ./
RUN npm run build
# vite.config.js emits to ../minions/server/ui/dist, i.e. /minions/server/ui/dist

# ── Stage 2: the Python server ────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app
COPY . /app
# Bring in the freshly built dashboard from the UI stage.
COPY --from=ui /minions/server/ui/dist /app/minions/server/ui/dist
RUN pip install --no-cache-dir "."

# Traces are stored under /root/.minion (the default ~/.minion path for root).
# Mount a volume here to persist data across container restarts.
EXPOSE 7337

CMD ["uvicorn", "minions.server.app:app", "--host", "0.0.0.0", "--port", "7337"]
