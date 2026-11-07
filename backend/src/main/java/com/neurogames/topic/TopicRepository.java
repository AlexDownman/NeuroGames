package com.neurogames.topic;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TopicRepository extends JpaRepository<Topic, UUID> {

    List<Topic> findAllByCollectionId(UUID collectionId);

    Optional<Topic> findByCollectionIdAndName(UUID collectionId, String name);
}
