package com.neurogames.ai;

import com.neurogames.ai.dto.ExtractedTopic;
import com.neurogames.ai.dto.GeneratedQuestion;
import com.neurogames.ai.dto.GeneratedQuestionSet;
import com.neurogames.ai.dto.MaterialAnalysisResult;
import com.neurogames.question.AnswerOption;
import com.neurogames.question.AnswerOptionRepository;
import com.neurogames.question.ApprovalStatus;
import com.neurogames.question.Question;
import com.neurogames.question.QuestionRepository;
import com.neurogames.topic.Topic;
import com.neurogames.topic.TopicRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Coordinates the two agents and persistence. Not an agent itself — no AI
 * calls happen here, just sequencing, topic upserts, validation, and saves.
 */
@Service
@Transactional
public class QuestionGenerationOrchestrator {

    private final LearningMaterialAnalysisAgent analysisAgent;
    private final QuestionGenerationAgent generationAgent;
    private final QuestionValidationService validationService;
    private final TopicRepository topicRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;

    public QuestionGenerationOrchestrator(
            LearningMaterialAnalysisAgent analysisAgent,
            QuestionGenerationAgent generationAgent,
            QuestionValidationService validationService,
            TopicRepository topicRepository,
            QuestionRepository questionRepository,
            AnswerOptionRepository answerOptionRepository) {
        this.analysisAgent = analysisAgent;
        this.generationAgent = generationAgent;
        this.validationService = validationService;
        this.topicRepository = topicRepository;
        this.questionRepository = questionRepository;
        this.answerOptionRepository = answerOptionRepository;
    }

    public List<Question> generate(UUID collectionId, String sourceText, int questionCount, String difficultyHint) {
        MaterialAnalysisResult analysis = analysisAgent.analyse(sourceText);
        List<ExtractedTopic> topics = analysis.topics != null ? analysis.topics : List.of();

        Map<String, Topic> topicsByName = upsertTopics(collectionId, topics);

        GeneratedQuestionSet generated = generationAgent.generate(sourceText, topics, questionCount, difficultyHint);
        List<GeneratedQuestion> candidates = generated.questions != null ? generated.questions : List.of();

        List<Question> saved = new ArrayList<>();
        Set<String> seenInBatch = new HashSet<>();

        for (GeneratedQuestion candidate : candidates) {
            if (candidate.questionText == null) {
                continue;
            }
            String normalized = candidate.questionText.strip().toLowerCase();
            if (normalized.isBlank() || !seenInBatch.add(normalized)) {
                continue;
            }
            if (!validationService.isValid(collectionId, candidate)) {
                continue;
            }

            saved.add(persist(collectionId, candidate, topicsByName));
        }

        return saved;
    }

    private Map<String, Topic> upsertTopics(UUID collectionId, List<ExtractedTopic> topics) {
        Map<String, Topic> topicsByName = new HashMap<>();
        for (ExtractedTopic extracted : topics) {
            if (extracted.name == null || extracted.name.isBlank()) {
                continue;
            }
            Topic topic = topicRepository.findByCollectionIdAndName(collectionId, extracted.name)
                    .orElseGet(() -> {
                        Topic created = new Topic();
                        created.setCollectionId(collectionId);
                        created.setName(extracted.name);
                        created.setDescription(extracted.description);
                        return topicRepository.save(created);
                    });
            topicsByName.put(extracted.name, topic);
        }
        return topicsByName;
    }

    private Question persist(UUID collectionId, GeneratedQuestion candidate, Map<String, Topic> topicsByName) {
        Question question = new Question();
        question.setCollectionId(collectionId);
        Topic topic = topicsByName.get(candidate.topic);
        question.setTopicId(topic != null ? topic.getId() : null);
        question.setQuestionText(candidate.questionText.strip());
        question.setExplanation(candidate.explanation);
        question.setDifficulty(candidate.difficulty.toLowerCase());
        question.setApprovalStatus(ApprovalStatus.PENDING_REVIEW);
        questionRepository.save(question);

        for (var optionCandidate : candidate.answerOptions) {
            AnswerOption option = new AnswerOption();
            option.setQuestionId(question.getId());
            option.setAnswerText(optionCandidate.text.strip());
            option.setCorrect(optionCandidate.isCorrect);
            answerOptionRepository.save(option);
        }

        return question;
    }
}
