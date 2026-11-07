package com.neurogames.ai;

import com.neurogames.ai.dto.MaterialAnalysisResult;
import com.neurogames.config.AiProperties;
import com.openai.client.OpenAIClient;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.chat.completions.StructuredChatCompletionCreateParams;
import org.springframework.stereotype.Service;

/**
 * First stage of question generation: reads the source material and names
 * the distinct topics/concepts it actually covers. Its output seeds both the
 * Topic table and the prompt for QuestionGenerationAgent, so topic naming
 * stays consistent across every question generated from the same material.
 */
@Service
public class LearningMaterialAnalysisAgent {

    private static final String SYSTEM_PROMPT =
            """
            You analyse educational material and identify the distinct topics or concepts
            it covers, for a lecturer building a question bank from it.

            Rules:
            - Only name topics that are actually present in the material below.
            - Do not invent topics, and do not rely on outside knowledge of the subject.
            - Keep topic names short (a few words) and specific, not generic.
            """;

    private final OpenAIClient client;
    private final AiProperties aiProperties;

    public LearningMaterialAnalysisAgent(OpenAIClient client, AiProperties aiProperties) {
        this.client = client;
        this.aiProperties = aiProperties;
    }

    public MaterialAnalysisResult analyse(String sourceText) {
        StructuredChatCompletionCreateParams<MaterialAnalysisResult> params = ChatCompletionCreateParams.builder()
                .responseFormat(MaterialAnalysisResult.class)
                .model(aiProperties.model())
                .addSystemMessage(SYSTEM_PROMPT)
                .addUserMessage(sourceText)
                .build();

        return client.chat().completions().create(params).choices().stream()
                .flatMap(choice -> choice.message().content().stream())
                .findFirst()
                .orElseThrow(() -> new AiGenerationException("Learning material analysis returned no result"));
    }
}
