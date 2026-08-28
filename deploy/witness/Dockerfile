FROM node:24.19.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN mkdir -p /var/lib/smokestack-witness \
  && chown -R node:node /app /var/lib/smokestack-witness
USER node

ENV WITNESS_HOST=0.0.0.0
ENV WITNESS_PORT=8787
ENV WITNESS_DATABASE_PATH=/var/lib/smokestack-witness/witness.sqlite
ENV WITNESS_SIGNING_KEY_PATH=/run/secrets/witness-signing-key.pem

EXPOSE 8787
VOLUME ["/var/lib/smokestack-witness"]

CMD ["node", "dist/src/witness/service.js"]
