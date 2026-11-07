package com.neurogames.material.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MaterialUploadUrlRequest(@NotBlank @Size(max = 255) String filename) {
}
