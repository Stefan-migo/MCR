FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libopenh264-6 \
    libavcodec-extra \
    libavformat58 \
    libavutil56 \
    libswscale5 \
    libswresample3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create output directory
RUN mkdir -p /app/output

# Expose port
EXPOSE 8000

# Start the application
CMD ["python", "src/main.py"]
