package com.neurogames.question;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnswerOptionRepository extends JpaRepository<AnswerOption, UUID> {

    List<AnswerOption> findAllByQuestionId(UUID questionId);

    List<AnswerOption> findAllByQuestionIdIn(List<UUID> questionIds);
}
