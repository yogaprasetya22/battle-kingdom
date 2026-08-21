.PHONY: install dev dev-client dev-server build clean

# Install all dependencies for client and server
install:
	bun install
	cd server && bun install

# Run the client in development mode
dev-client:
	bun run dev

# Run the server in development mode
dev-server:
	cd server && bun run dev

# Run both client and server concurrently (requires 'concurrently' globally, or runs sequentially in background)
dev:
	@echo "Starting server and client..."
	(cd server && bun run dev) & bun run dev

# Build both client and server for production
build:
	bun run build
	cd server && bun run build

# Clean build artifacts and node_modules
clean:
	rm -rf dist
	rm -rf server/dist
	rm -rf node_modules
	rm -rf server/node_modules
