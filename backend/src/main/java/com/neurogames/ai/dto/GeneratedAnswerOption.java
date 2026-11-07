package com.neurogames.ai.dto;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;

public class GeneratedAnswerOption {

    @JsonPropertyDescription("The answer option's text.")
    public String text;

    @JsonPropertyDescription("True if this is the correct answer. Exactly one option per question must be true.")
    public boolean isCorrect;
}
