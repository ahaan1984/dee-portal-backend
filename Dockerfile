# Use the official Node.js image for the backend
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Command to start the backend server
CMD ["npm", "start"]

# Expose the port used by the backend (change if needed)
EXPOSE 5000
