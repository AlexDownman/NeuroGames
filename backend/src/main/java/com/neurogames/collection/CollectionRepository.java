package com.neurogames.collection;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CollectionRepository extends JpaRepository<Collection, UUID> {

    List<Collection> findAllByOwnerId(UUID ownerId);

    Optional<Collection> findByIdAndOwnerId(UUID id, UUID ownerId);
}
