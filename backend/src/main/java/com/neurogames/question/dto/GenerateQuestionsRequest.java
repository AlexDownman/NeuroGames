package com.neurogames.question.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record GenerateQuestionsRequest(
        @NotBlank String sourceText,
        @Min(1) @Max(20) Integer questionCount,
        String difficulty) {

    private static final int DEFAULT_QUESTION_COUNT = 5;

    public int questionCountOrDefault() {
        return questionCount != null ? questionCount : DEFAULT_QUESTION_COUNT;
    }
}
