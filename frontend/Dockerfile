# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY . .
RUN npm install
RUN ng build --output-path=dist

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

RUN  chown -R nginx:nginx /usr/share/nginx/html  /var/cache/nginx  /run

USER nginx

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]