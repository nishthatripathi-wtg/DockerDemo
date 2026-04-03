# ---- Stage 1: Build ----
FROM maven:3.9.6-eclipse-temurin-17 AS build

# WORKDIR /app/Backend

#RUN apt-get update && apt-get install -y  --no-install-recommends git \
# && apt-get clean \
# && rm -rf /var/lib/apt/lists/*

#ARG COMMIT_ID=1

#RUN echo "$COMMIT_ID"
#RUN git clone --depth=1 --filter=blob:none --sparse \
#    https://github.com/nishthatripathi-wtg/DockerDemo.git source \
# && cd source \
# && git sparse-checkout set backend

WORKDIR /app

COPY . .

RUN mvn clean package -DskipTests

# ---- Stage 2: Runtime ----
FROM azul/zulu-openjdk-alpine:17-jre

ARG OTEL_JAVA_AGENT_VERSION=2.20.1

WORKDIR /app/backend

RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=build --chown=spring:spring /app/target/*.jar app.jar

ADD --chown=spring:spring \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/opentelemetry-javaagent.jar \
    opentelemetry-javaagent.jar

USER spring

EXPOSE 8080

ENTRYPOINT ["java", "-javaagent:/app/backend/opentelemetry-javaagent.jar", "-jar", "app.jar"]