# ---- Stage 1: Build ----
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

RUN apt-get update && apt-get install -y  --no-install-recommends git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*


RUN git clone --depth=1 --filter=blob:none --sparse \
    https://github.com/nishthatripathi-wtg/DockerDemo.git source \
 && cd source \
 && git sparse-checkout set backend

WORKDIR /app/source/backend

RUN mvn clean package -DskipTests

# ---- Stage 2: Runtime ----
FROM azul/zulu-openjdk-alpine:17-jre

WORKDIR /app/src/backend

RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=build --chown=spring:spring /app/source/backend/target/*.jar app.jar

USER spring

EXPOSE 8080

ENTRYPOINT ["java","-jar","app.jar"]