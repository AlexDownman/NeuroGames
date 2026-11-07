package com.neurogames.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Loads a local ".env" file (project root) into System properties before
 * Spring starts, so SUPABASE_DB_PASSWORD / SUPABASE_JWT_SECRET etc. don't
 * have to be exported by hand. A real OS environment variable or -D system
 * property with the same name always wins — this only fills gaps, never
 * overrides, so it's dev-only convenience and never a way to override a
 * real deployment's config.
 *
 * Deliberately not Spring's EnvironmentPostProcessor SPI: that extension
 * point relocated package between Spring Boot major versions and silently
 * no-ops if you target the wrong one, which is a bad failure mode for
 * something that's supposed to load secrets. Plain System.setProperty
 * before SpringApplication.run() has no such ambiguity.
 */
public final class DotenvLoader {

    private DotenvLoader() {
    }

    public static void loadIfPresent() {
        Path envFile = Path.of(".env");
        if (!Files.isRegularFile(envFile)) {
            return;
        }

        try {
            for (String line : Files.readAllLines(envFile)) {
                String trimmed = line.strip();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                int separator = trimmed.indexOf('=');
                if (separator < 0) {
                    continue;
                }
                String key = trimmed.substring(0, separator).strip();
                String value = trimmed.substring(separator + 1).strip();
                if (value.isEmpty()) {
                    continue;
                }
                if (System.getenv(key) == null && System.getProperty(key) == null) {
                    System.setProperty(key, value);
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read .env file", ex);
        }
    }
}
