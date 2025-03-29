# Use Node.js 18 for building
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build Next.js app
COPY . . 
RUN npm run build

# Use a smaller production-ready Node.js base image
FROM node:18-alpine

WORKDIR /app

# Set NODE_ENV to production for the runtime environment
ENV NODE_ENV=production

# Install necessary dependencies for Puppeteer/Chromium on Alpine
# See: https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-puppeteer-on-alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont

# Copy built app from the builder stage
COPY --from=builder /app ./

# Expose port 3000 for Next.js
EXPOSE 3000

# Start the Next.js app
CMD ["npx", "next", "start"]