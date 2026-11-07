package com.neurogames.question;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionRepository extends JpaRepository<Question, UUID> {

    List<Question> findAllByCollectionId(UUID collectionId);

    Optional<Question> findByIdAndCollectionId(UUID id, UUID collectionId);

    boolean existsByCollectionIdAndQuestionText(UUID collectionId, String questionText);
}
