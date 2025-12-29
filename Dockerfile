FROM node:20-bookworm AS builder

ARG BUILD_ENV=production
ENV NODE_ENV=${BUILD_ENV}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
   ca-certificates wget \
   build-essential python3 python-is-python3 pkg-config \
   libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
   libvips libvips-dev libglib2.0-dev libexpat1-dev \
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

FROM node:20-bookworm-slim AS runtime

ARG BUILD_ENV=production
ENV NODE_ENV=${BUILD_ENV}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
   ca-certificates wget \
   libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
   libvips libglib2.0-0 libexpat1 \
 && update-ca-certificates || true \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY --from=builder --chown=node:node /usr/src/app /usr/src/app

USER node

CMD ["sh","-c","if [ \"$NODE_ENV\" = \"development\" ]; then npm run dev; else npm start; fi"]
