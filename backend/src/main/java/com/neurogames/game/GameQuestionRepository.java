package com.neurogames.game;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameQuestionRepository extends JpaRepository<GameQuestion, GameQuestionId> {

    List<GameQuestion> findAllByIdGameIdOrderByDisplayOrder(UUID gameId);
}
