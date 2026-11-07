package com.neurogames.collection.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CollectionRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 2000) String description,
        boolean publicCollection) {
}
