package com.neurogames.material;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LearningMaterialRepository extends JpaRepository<LearningMaterial, UUID> {

    List<LearningMaterial> findAllByCollectionId(UUID collectionId);

    Optional<LearningMaterial> findByIdAndCollectionId(UUID id, UUID collectionId);
}
