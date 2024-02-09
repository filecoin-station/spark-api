# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.8.1
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="nodejs"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV production
ENV SENTRY_ENVIRONMENT production
ENV MAX_MEASUREMENTS_PER_ROUND 100000

#######################################################################
# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install -y build-essential pkg-config python-is-python3

# Install node modules
# NPM will not install any package listed in "devDependencies" when NODE_ENV is set to "production",
# to install all modules: "npm install --production=false".
# Ref: https://docs.npmjs.com/cli/v9/commands/npm-install#description
COPY --link package-lock.json package.json ./
RUN npm ci

# Copy application code
COPY --link . .

#######################################################################
# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
CMD [ "npm", "run", "start" ]
