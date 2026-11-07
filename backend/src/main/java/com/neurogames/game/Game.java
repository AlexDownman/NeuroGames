package com.neurogames.game;

import com.neurogames.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "games")
@Getter
@Setter
@NoArgsConstructor
public class Game extends BaseEntity {

    @Column(name = "collection_id", nullable = false)
    private UUID collectionId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "game_type", nullable = false)
    private GameType gameType;

    // Raw JSON text; Hibernate stores/reads it as native jsonb via the SqlTypes.JSON
    // code. Not used for Answer Run's scoring (that lives per-question in
    // GameQuestion.metadata) — reserved for whole-game settings later.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String configuration = "{}";
}
