package com.neurogames.game.dto;

import com.neurogames.game.GameSession;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public record GameSessionResponse(
        UUID id, UUID gameId, String sessionCode, String status, Instant startedAt, Instant endedAt) {

    public static GameSessionResponse from(GameSession session) {
        return new GameSessionResponse(
                session.getId(),
                session.getGameId(),
                session.getSessionCode(),
                session.getStatus().name().toLowerCase(Locale.ROOT),
                session.getStartedAt(),
                session.getEndedAt());
    }
}
