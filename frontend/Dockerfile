# Frontend CV-Gateway : build Vite puis nginx.
# Cible `test` = CI (npm ci + build). Cible finale = image de prod.

FROM node:20-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=test /app/dist /usr/share/nginx/html
EXPOSE 80
