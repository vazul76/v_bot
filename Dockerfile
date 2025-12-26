# Use Node 20 slim as base
FROM node:20-bookworm-slim

# Build-time argument to choose environment
ARG BUILD_ENV=development
ENV NODE_ENV=${BUILD_ENV}

# Install system dependencies required by native modules (canvas, sharp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
   ca-certificates wget build-essential python3 python-is-python3 pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libvips-dev \
 && update-ca-certificates || true \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package manifests first for better layer caching
COPY package*.json ./

# Install dependencies. In production omit devDependencies.
RUN if [ "$NODE_ENV" = "production" ]; then \
      npm ci --omit=dev; \
    else \
      npm ci; \
    fi

# Copy application files
COPY . .

# Expose no ports (WhatsApp bot). Set a sensible default command depending on env.
CMD ["sh","-c","if [ \"$NODE_ENV\" = \"development\" ]; then npm run dev; else npm start; fi"]
