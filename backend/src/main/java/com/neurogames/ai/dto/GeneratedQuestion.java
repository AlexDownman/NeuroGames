package com.neurogames.ai.dto;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import java.util.List;

public class GeneratedQuestion {

    @JsonPropertyDescription("The question text, answerable using only the source material.")
    public String questionText;

    @JsonPropertyDescription("One or two sentences explaining why the correct answer is correct, citing the material.")
    public String explanation;

    @JsonPropertyDescription("Exactly one of: easy, medium, hard.")
    public String difficulty;

    @JsonPropertyDescription("The name of the topic (from the provided topic list) this question belongs to.")
    public String topic;

    @JsonPropertyDescription("Two to five answer options; exactly one must have isCorrect set to true.")
    public List<GeneratedAnswerOption> answerOptions;
}
