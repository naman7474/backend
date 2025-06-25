FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Environment & port
ENV NODE_ENV=production
EXPOSE 4000

# Start the server
CMD ["node", "src/index.js"] 