# ---- Stage 1: build frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend + bundled frontend ----
FROM node:20-alpine
WORKDIR /app

# better-sqlite3 needs build tools to compile its native binding
RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev
COPY backend/ ./

WORKDIR /app/frontend
COPY --from=frontend-build /app/frontend/dist ./dist

WORKDIR /app/backend
ENV PORT=8080
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["node", "src/server.js"]
