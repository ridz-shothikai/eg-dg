# Development Stage
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

# The local code will be mounted via docker-compose volume, so COPY . . is not needed here.

# Use a smaller production-ready Node.js base image
FROM node:18-alpine

WORKDIR /app

# Set NODE_ENV to production for the runtime environment
ENV NODE_ENV=production

# Install necessary dependencies for system-installed Chromium on Alpine
# Includes chromium package, base tools, fonts, and common runtime libraries
RUN apk add --no-cache \
    chromium \
    # Base runtime libs
    udev \
    libstdc++ \
    # Fonts and font rendering
    fontconfig \
    ttf-freefont \
    freetype \
    harfbuzz \
    # Networking and certs
    nss \
    ca-certificates \
    # Common X11/GUI libs often needed by Chromium, even headless
    mesa-gbm \
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxi \
    libxrandr \
    libxrender \
    libxshmfence \
    libxtst \
    # Accessibility and GTK libs (atk, at-spi2-atk omitted as not found in repo)
    # Graphics and multimedia libs
    cairo \
    cups-libs \
    dbus-libs \
    expat \
    gdk-pixbuf \
    glib \
    gtk+3.0 \
    pango \
    alsa-lib \
    mesa-gbm

# Remove manual Chromium download steps
# ENV CHROMIUM_REVISION=...
# RUN wget ... && unzip ... && mv ... && chmod ...

# Remove environment variable as path is hardcoded in the application now
# ENV PUPPETEER_EXECUTABLE_PATH=/opt/chromium/chrome

# Copy built app from the builder stage
# Ensure node_modules are copied correctly after build dependencies might differ
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Expose port 3000 for Next.js
EXPOSE 3000

# Start the Next.js app
CMD ["npx", "next", "start"]
