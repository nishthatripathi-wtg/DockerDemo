# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache git bash

# Sparse checkout frontend
RUN git clone --depth=1 --filter=blob:none --sparse https://github.com/nishthatripathi-wtg/DockerDemo.git source \
 && cd source \
 && git sparse-checkout set frontend

WORKDIR /app/source/frontend

RUN npm install
RUN npm install -g @angular/cli

RUN ng build --output-path=dist

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine
COPY --from=build /app/source/frontend/dist /usr/share/nginx/html

RUN  chown -R nginx:nginx /usr/share/nginx/html  /var/cache/nginx  /run

USER nginx

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]