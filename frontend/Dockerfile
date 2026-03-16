FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appuser && adduser -S appuser -G appuser
COPY package*.json ./
RUN npm install
RUN npm install -g @angular/cli
COPY --chown=appuser:appuser . .
USER appuser
EXPOSE 4200
ENTRYPOINT ["ng", "serve", "--host", "0.0.0.0", "--port", "4200"]
