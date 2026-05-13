# ---- Stage 1: Build ----
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn clean package -DskipTests

# ---- Stage 2: Runtime ----
FROM azul/zulu-openjdk-alpine:17-jre

ARG OTEL_JAVA_AGENT_VERSION=2.20.1
ARG OTEL_JAVA_AGENT_SHA256=d94e9fc648cab37e540571352937acc06b8014182ddbd2d93a6c08641c84e48e

WORKDIR /app/translator

RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=build --chown=spring:spring /app/target/*.jar app.jar

ADD --chown=spring:spring \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/opentelemetry-javaagent.jar \
    opentelemetry-javaagent.jar

RUN echo "${OTEL_JAVA_AGENT_SHA256}  opentelemetry-javaagent.jar" | sha256sum -c -

USER spring

EXPOSE 8081

ENTRYPOINT ["java", "-javaagent:/app/translator/opentelemetry-javaagent.jar", "-jar", "app.jar"]
