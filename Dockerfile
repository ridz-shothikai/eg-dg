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

# Add ARG for NEXTAUTH_URL (can be overridden during build)
ARG NEXTAUTH_URL=http://163.172.181.252:3001
# Set ENV NEXTAUTH_URL using the ARG value
ENV NEXTAUTH_URL=${NEXTAUTH_URL}


# Install necessary dependencies for manually downloaded Chromium on Alpine
# wget and unzip are needed for download; fontconfig and ttf-
RUN apk add --no-cache \
    wget \
    unzip \
    fontconfig \
    ttf-freefont \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    udev \
    libstdc++

# Download and unzip specific Chromium revision compatible with @sparticuz/chromium v133
# Find compatible revisions: https://github.com/Sparticuz/chromium/releases
# Using a known good revision URL (adjust if needed based on exact compatibility)
# Trying a different build number for v133
ENV CHROMIUM_REVISION=133.0.6911.0
# Updated URL to official chrome-for-testing storage
RUN wget --no-verbose https://storage.googleapis.com/chrome-for-testing-public/${CHROMIUM_REVISION}/linux64/chrome-linux64.zip -P /tmp \
    && unzip /tmp/chrome-linux64.zip -d /opt \
    && rm /tmp/chrome-linux64.zip \
    && mv /opt/chrome-linux64 /opt/chromium \
    && chmod +x /opt/chromium/chrome

# Set the executable path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/opt/chromium/chrome

# Copy built app from the builder stage
COPY --from=builder /app ./

# Expose port 3000 for Next.js
EXPOSE 3000

# Start the Next.js app
CMD ["npx", "next", "start"]
