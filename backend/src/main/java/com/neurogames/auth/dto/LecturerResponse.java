package com.neurogames.auth.dto;

import com.neurogames.auth.Lecturer;
import java.time.Instant;
import java.util.UUID;

public record LecturerResponse(UUID id, String email, String fullName, Instant createdAt) {

    public static LecturerResponse from(Lecturer lecturer) {
        return new LecturerResponse(
                lecturer.getId(), lecturer.getEmail(), lecturer.getFullName(), lecturer.getCreatedAt());
    }
}
