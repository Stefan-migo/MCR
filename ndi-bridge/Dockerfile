FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    pkg-config \
    cmake \
    libcairo2-dev \
    libgirepository1.0-dev \
    libgirepository-2.0-dev \
    gir1.2-glib-2.0-dev \
    gir1.2-girepository-2.0-dev \
    libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.docker.txt requirements.txt

# Install Python dependencies with timeout
RUN pip install --no-cache-dir --timeout 1000 -r requirements.txt

# Copy source code
COPY . .

# Create output directory
RUN mkdir -p /app/output

# Expose port
EXPOSE 8000

# Start the application
CMD ["python", "src/main.py"]
