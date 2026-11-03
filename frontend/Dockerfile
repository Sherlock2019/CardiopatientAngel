FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm cache survives between builds, so rebuilds do not re-download packages
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline
COPY . .
# Type-checking runs in CI (npm run build); the image only bundles.
RUN npx vite build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
