package com.neurogames.material.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Sent after the browser has uploaded the file to the signed URL. */
public record RegisterMaterialRequest(
        @NotBlank @Size(max = 500) String storagePath,
        @NotBlank @Size(max = 255) String filename) {
}
