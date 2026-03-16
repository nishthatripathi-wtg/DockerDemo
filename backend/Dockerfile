FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

RUN apt-get update && apt-get install -y  --no-install-recommends git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 --branch main https://github.com/nishthatripathi-wtg/DockerDemo.git source

WORKDIR /app/source/backend

RUN mvn clean package -DskipTests

RUN find  -mindepth 1 -maxdepth 1 ! -name target -exec rm -rf {} +

FROM azul/zulu-openjdk-alpine:17-jre

WORKDIR /app/src/backend

RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=build /app/source/backend/target/*.jar app.jarc

RUN chown -R spring:spring /app

USER spring

EXPOSE 8080

ENTRYPOINT ["java","-jar","app.jar"]
