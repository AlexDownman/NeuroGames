package com.neurogames.material.dto;

/**
 * Where the browser should PUT the file (a one-time signed Supabase Storage
 * URL), and the storagePath to send back when registering the material.
 */
public record MaterialUploadUrlResponse(String uploadUrl, String storagePath) {
}
