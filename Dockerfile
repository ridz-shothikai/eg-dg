# Development Stage
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

# The local code will be mounted via docker-compose volume, so COPY . . is not needed here.

# Expose port 3000 for Next.js dev server
EXPOSE 3000

# Start the Next.js development server
CMD ["npm", "run", "dev"]


# # Builder Stage (Production) - Temporarily Commented Out
# # FROM node:18-alpine AS builder
# #
# # WORKDIR /app

# # Install only production dependencies
# # COPY package*.json ./
# # RUN npm install --omit=dev
# #
# # # Copy source and build Next.js app
# # COPY . .
# # RUN npm run build


# # Production Stage - Temporarily Commented Out
# # FROM node:18-alpine AS production
# #
# # WORKDIR /app

# # Set NODE_ENV to production for the runtime environment
# # ENV NODE_ENV=production
# #
# # # Install necessary dependencies for manually downloaded Chromium on Alpine
# # # wget and unzip are needed for download; fontconfig and ttf-
# # RUN apk add --no-cache \
# #     wget \
# #     unzip \
# #     fontconfig \
# #     ttf-freefont \
# #     nss \
# #     freetype \
# #     harfbuzz \
# #     ca-certificates \
# #     udev \
# #     libstdc++

# # Download and unzip specific Chromium revision compatible with @sparticuz/chromium v133
# # Find compatible revisions: https://github.com/Sparticuz/chromium/releases
# # Using a known good revision URL (adjust if needed based on exact compatibility)
# # Trying a different build number for v133
# # ENV CHROMIUM_REVISION=133.0.6911.0
# # # Updated URL to official chrome-for-testing storage
# # RUN wget --no-verbose https://storage.googleapis.com/chrome-for-testing-public/${CHROMIUM_REVISION}/linux64/chrome-linux64.zip -P /tmp \
# #     && unzip /tmp/chrome-linux64.zip -d /opt \
# #     && rm /tmp/chrome-linux64.zip \
# #     && mv /opt/chrome-linux64 /opt/chromium \
# #     && chmod +x /opt/chromium/chrome

# # Set the executable path for Puppeteer
# # ENV PUPPETEER_EXECUTABLE_PATH=/opt/chromium/chrome
# #
# # # Copy built app from the builder stage
# # COPY --from=builder /app/public ./public
# # COPY --from=builder /app/.next ./.next
# # COPY --from=builder /app/node_modules ./node_modules
# # COPY --from=builder /app/package.json ./package.json
# #
# # # Expose port 3000 for Next.js
# # EXPOSE 3000
# #
# # # Start the Next.js app
# # CMD ["npx", "next", "start"]
