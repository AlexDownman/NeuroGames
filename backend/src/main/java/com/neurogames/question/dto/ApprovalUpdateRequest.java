package com.neurogames.question.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ApprovalUpdateRequest(
        @NotBlank
        @Pattern(regexp = "pending_review|approved|rejected", message = "must be one of: pending_review, approved, rejected")
        String status) {
}
