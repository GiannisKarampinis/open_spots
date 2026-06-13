# Stage 1: Build frontend with Node.js
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend .

# Build with Vite
RUN npm run build

# Stage 2: Python app with collected static files
FROM python:3.12-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies (added gettext for translations)
RUN apt-get update && apt-get install -y --no-install-recommends\
    build-essential \
    libpq-dev \
    gettext \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

COPY --from=frontend-builder /app/frontend/dist ./staticfiles/react-app

# Expose Django port
EXPOSE 8000

# Run the app with Daphne (ASGI server)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "openspots.asgi:application"]
