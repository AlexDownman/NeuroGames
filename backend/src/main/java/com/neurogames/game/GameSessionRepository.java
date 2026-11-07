package com.neurogames.game;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameSessionRepository extends JpaRepository<GameSession, UUID> {

    List<GameSession> findAllByGameId(UUID gameId);

    boolean existsBySessionCode(String sessionCode);
}
