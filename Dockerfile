FROM node:22

# Set the working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the application files
COPY . .

# Expose the port your app is running on
EXPOSE 3000

# Command to run your application
CMD ["npm", "start"]
