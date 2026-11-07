package com.neurogames.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.supabase")
public record JwtProperties(String jwtSecret) {
}
