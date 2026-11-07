package com.neurogames.material.dto;

import java.time.Instant;

/** A short-lived signed Supabase Storage URL for the original uploaded file. */
public record MaterialDownloadResponse(String url, String filename, Instant expiresAt) {
}
