FROM node:20-bookworm-slim

ARG BUILD_ENV=development
ENV NODE_ENV=${BUILD_ENV}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
   ca-certificates wget \
   build-essential python3 python-is-python3 pkg-config \
   libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
   libvips libvips-dev \
 && ln -s /usr/bin/python3 /usr/bin/python \
 && update-ca-certificates || true \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

ENV npm_config_build_from_source=false \
    npm_config_ignore_scripts=false \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1

RUN if [ "$NODE_ENV" = "production" ]; then \
      npm ci --omit=dev --verbose; \
    else \
      npm ci --verbose; \
    fi

COPY . .

CMD ["sh","-c","if [ \"$NODE_ENV\" = \"development\" ]; then npm run dev; else npm start; fi"]
