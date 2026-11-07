package com.neurogames.game.dto;

import com.neurogames.game.Game;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public record GameResponse(
        UUID id, String title, String description, String gameType, int questionCount, Instant createdAt) {

    public static GameResponse from(Game game, int questionCount) {
        return new GameResponse(
                game.getId(),
                game.getTitle(),
                game.getDescription(),
                game.getGameType().name().toLowerCase(Locale.ROOT),
                questionCount,
                game.getCreatedAt());
    }
}
