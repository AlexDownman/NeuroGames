package com.neurogames.question.dto;

import com.neurogames.question.AnswerOption;
import com.neurogames.question.Question;
import java.util.List;
import java.util.UUID;

public record QuestionResponse(
        UUID id,
        String questionText,
        String explanation,
        String difficulty,
        UUID topicId,
        String approvalStatus,
        List<AnswerOptionResponse> answerOptions) {

    public static QuestionResponse from(Question question, List<AnswerOption> options) {
        return new QuestionResponse(
                question.getId(),
                question.getQuestionText(),
                question.getExplanation(),
                question.getDifficulty(),
                question.getTopicId(),
                question.getApprovalStatus().name().toLowerCase(),
                options.stream().map(AnswerOptionResponse::from).toList());
    }
}
