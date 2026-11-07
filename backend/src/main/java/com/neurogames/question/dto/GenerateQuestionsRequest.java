package com.neurogames.question.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;

/** Exactly one of sourceText / sourceMaterialId must be given — checked in QuestionService, not here. */
public record GenerateQuestionsRequest(
        String sourceText,
        UUID sourceMaterialId,
        @Min(1) @Max(20) Integer questionCount,
        String difficulty) {

    private static final int DEFAULT_QUESTION_COUNT = 5;

    public int questionCountOrDefault() {
        return questionCount != null ? questionCount : DEFAULT_QUESTION_COUNT;
    }
}
