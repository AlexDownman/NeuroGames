# Built and run by Vercel's container runtime (see /vercel.json). Also works
# locally: docker build -t neurogames-backend . && docker run --env-file .env -p 8080:80 neurogames-backend

FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
# Dependencies first, so source-only changes reuse this layer.
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B -DskipTests package && cp target/*.jar /app.jar

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app.jar app.jar
# Vercel sends traffic to port 80 unless PORT is overridden in project settings.
ENV PORT=80
# Size the heap from the function's memory limit, and skip slow entropy waits on cold start.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:TieredStopAtLevel=1 -Djava.security.egd=file:/dev/./urandom"
EXPOSE 80
ENTRYPOINT ["java", "-jar", "app.jar"]
