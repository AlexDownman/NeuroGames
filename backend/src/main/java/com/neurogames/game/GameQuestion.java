package com.neurogames.game;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Join row: a question's position within a game, plus game-specific
 * metadata — for Answer Run, {"pointValue": N}, read by the submit_answer
 * Postgres RPC to award/deduct the show-style escalating bank value.
 */
@Entity
@Table(name = "game_questions")
@Getter
@Setter
@NoArgsConstructor
public class GameQuestion {

    @EmbeddedId
    private GameQuestionId id;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String metadata = "{}";
}
