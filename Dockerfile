# Tiered Runway Triage Agent — self-contained demo image.
# `docker build -t triage-agent .` then `docker run -p 3000:3000 triage-agent`
# starts the full scripted demo (dashboard + drain scenario) with no local
# npm install, no .env, and no real credentials needed — see run-live-demo.ts's
# CLI entry point, which uses a console-logging executor, not a real wallet.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so this layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

# Now the rest of the source.
COPY . .

# Sanity-check the project actually type-checks and passes its test suite
# as part of the image build, not just at runtime — a broken build fails
# `docker build`, not a judge's `docker run`.
RUN npx tsc -p tsconfig.json --noEmit
RUN npx vitest run

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "demo"]
