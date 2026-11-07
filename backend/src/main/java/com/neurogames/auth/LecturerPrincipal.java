package com.neurogames.auth;

import java.util.UUID;

/** The authenticated caller, resolved from a verified Supabase JWT. */
public record LecturerPrincipal(UUID lecturerId, String email) {
}
