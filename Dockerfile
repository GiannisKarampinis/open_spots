# Use official Python image
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

# Expose Django port
EXPOSE 8000

# Run the app with Daphne (ASGI server)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "openspots.asgi:application"]
