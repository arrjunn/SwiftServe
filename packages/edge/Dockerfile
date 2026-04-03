FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Copy shared package for build
COPY ../shared ../shared
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
