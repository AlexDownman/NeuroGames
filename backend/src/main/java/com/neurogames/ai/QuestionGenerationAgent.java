package com.neurogames.ai;

import com.neurogames.ai.dto.ExtractedTopic;
import com.neurogames.ai.dto.GeneratedQuestionSet;
import com.neurogames.config.AiProperties;
import com.openai.client.OpenAIClient;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.chat.completions.StructuredChatCompletionCreateParams;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Second stage of question generation: writes grounded multiple-choice
 * questions from the source material, tagged against the topics
 * LearningMaterialAnalysisAgent already found. Never contains game-specific
 * logic — this agent's only job is a reusable question bank entry.
 */
@Service
public class QuestionGenerationAgent {

    private static final String SYSTEM_PROMPT =
            """
            You write multiple-choice questions for an educational quiz, based only on the
            material the user provides.

            Rules:
            - Never use outside knowledge of the subject, even if you have it. Every fact in
              a question or its explanation must be traceable to the material given.
            - Each question has exactly one correct answer and one to four incorrect but
              plausible answers.
            - Keep questions unambiguous: someone who has read the material should be able
              to pick exactly one option as clearly correct.
            - difficulty must be exactly one of: easy, medium, hard.
            - topic must be one of the topic names provided to you. If none fit, use the
              closest one rather than inventing a new topic name.
            - If the material does not support the requested number of good questions,
              return fewer rather than inventing filler questions.
            """;

    private final OpenAIClient client;
    private final AiProperties aiProperties;

    public QuestionGenerationAgent(OpenAIClient client, AiProperties aiProperties) {
        this.client = client;
        this.aiProperties = aiProperties;
    }

    public GeneratedQuestionSet generate(
            String sourceText, List<ExtractedTopic> topics, int questionCount, String difficultyHint) {
        String topicList = topics.stream()
                .map(topic -> "- " + topic.name + ": " + topic.description)
                .collect(Collectors.joining("\n"));

        StringBuilder userMessage = new StringBuilder()
                .append("Topics identified in this material:\n")
                .append(topicList)
                .append("\n\nSource material:\n")
                .append(sourceText)
                .append("\n\nGenerate ")
                .append(questionCount)
                .append(" question(s)");
        if (difficultyHint != null && !difficultyHint.isBlank()) {
            userMessage.append(" at ").append(difficultyHint).append(" difficulty");
        }
        userMessage.append('.');

        StructuredChatCompletionCreateParams<GeneratedQuestionSet> params = ChatCompletionCreateParams.builder()
                .responseFormat(GeneratedQuestionSet.class)
                .model(aiProperties.model())
                .addSystemMessage(SYSTEM_PROMPT)
                .addUserMessage(userMessage.toString())
                .build();

        return client.chat().completions().create(params).choices().stream()
                .flatMap(choice -> choice.message().content().stream())
                .findFirst()
                .orElseThrow(() -> new AiGenerationException("Question generation returned no result"));
    }
}
