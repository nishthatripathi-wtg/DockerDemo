
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app

RUN apt-get update && apt-get install -y git

RUN git clone https://github.com/your-username/your-springboot-project.git .

RUN mvn clean package -DskipTests


FROM azul/zulu-openjdk-alpine:17-jre

WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring

COPY target/demo-backend-0.0.1-SNAPSHOT.jar app.jar

RUN chown -R spring:spring /app

USER spring

EXPOSE 8080

ENTRYPOINT ["java","-jar","myapp.jar"]