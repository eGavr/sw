# Build the Yandex provider JAR, bake it into Keycloak, and re-run kc.sh build so the provider is registered.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /p
COPY pom.xml .
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM quay.io/keycloak/keycloak:26.0
COPY --from=build /p/target/keycloak-yandex-1.0.0.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build
