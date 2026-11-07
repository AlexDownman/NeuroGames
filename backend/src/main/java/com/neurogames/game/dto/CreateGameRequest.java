package com.neurogames.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** v1: always builds an Answer Run game — other game types need their own scoring rules first. */
public record CreateGameRequest(
        @NotBlank @Size(max = 150) String title,
        @Size(max = 2000) String description,
        @NotEmpty @Size(max = 30) List<UUID> questionIds) {
}
