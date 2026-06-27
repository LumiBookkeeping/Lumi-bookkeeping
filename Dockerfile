# Portable container image for Lumi Bookkeeping.
# Works on Fly.io, Railway, Render (env: docker), or any container host.
FROM node:22-alpine
WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Application source.
COPY . .

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "server.js"]
