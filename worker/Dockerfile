FROM oven/bun:1

WORKDIR /app

# Dependencies installeren
COPY package.json bun.lockb* ./
RUN bun install --production

# Source code kopiëren
COPY src/ ./src/

# Worker starten
CMD ["bun", "run", "src/index.ts"]
