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

# Copy built app from the builder stage
COPY --from=builder /app ./ 

# Expose port 3000 for Next.js
EXPOSE 3000

# Start the Next.js app
CMD ["npx", "next", "start"]