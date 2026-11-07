package com.neurogames.question.dto;

import com.neurogames.question.AnswerOption;
import java.util.UUID;

public record AnswerOptionResponse(UUID id, String text, boolean correct) {

    public static AnswerOptionResponse from(AnswerOption option) {
        return new AnswerOptionResponse(option.getId(), option.getAnswerText(), option.isCorrect());
    }
}
