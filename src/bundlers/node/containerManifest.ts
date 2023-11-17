export const nodeContainerManifest = `
FROM node:alpine

# Set the working directory to /app
WORKDIR /app

# Copy the local.mjs file to the container
COPY . .

EXPOSE 8080
# Start the application
CMD ["node", "local.mjs", "8080"]
`;
