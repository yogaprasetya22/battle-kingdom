FROM oven/bun:latest
WORKDIR /app
COPY server/package.json ./
RUN bun install
COPY server/ .
RUN bun run build
EXPOSE 2567
CMD ["bun", "run", "start"]
