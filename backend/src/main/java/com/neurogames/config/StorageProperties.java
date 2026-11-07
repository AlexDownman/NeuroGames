package com.neurogames.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Supabase Storage settings. The publishable key is not a secret — requests
 * are authorised by the calling teacher's own JWT, so the bucket's RLS
 * policies (database/schema.sql) decide what each teacher can touch.
 */
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(String url, String publishableKey, String bucket, Duration signedUrlTtl) {
}
