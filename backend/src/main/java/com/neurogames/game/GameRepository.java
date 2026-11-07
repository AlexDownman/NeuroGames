package com.neurogames.game;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameRepository extends JpaRepository<Game, UUID> {

    List<Game> findAllByCollectionId(UUID collectionId);

    Optional<Game> findByIdAndCollectionId(UUID id, UUID collectionId);
}
