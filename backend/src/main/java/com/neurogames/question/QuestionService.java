package com.neurogames.question;

import com.neurogames.ai.QuestionGenerationOrchestrator;
import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.InvalidRequestException;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.material.ExtractionStatus;
import com.neurogames.material.LearningMaterial;
import com.neurogames.material.LearningMaterialRepository;
import com.neurogames.material.MaterialExtractionException;
import com.neurogames.question.dto.GenerateQuestionsRequest;
import com.neurogames.question.dto.QuestionResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class QuestionService {

    private final CollectionRepository collectionRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final LearningMaterialRepository materialRepository;
    private final QuestionGenerationOrchestrator orchestrator;

    public QuestionService(
            CollectionRepository collectionRepository,
            QuestionRepository questionRepository,
            AnswerOptionRepository answerOptionRepository,
            LearningMaterialRepository materialRepository,
            QuestionGenerationOrchestrator orchestrator) {
        this.collectionRepository = collectionRepository;
        this.questionRepository = questionRepository;
        this.answerOptionRepository = answerOptionRepository;
        this.materialRepository = materialRepository;
        this.orchestrator = orchestrator;
    }

    public List<QuestionResponse> generate(UUID collectionId, UUID ownerId, GenerateQuestionsRequest request) {
        requireOwnedCollection(collectionId, ownerId);

        String sourceText = resolveSourceText(collectionId, request);
        List<Question> generated = orchestrator.generate(
                collectionId,
                sourceText,
                request.sourceMaterialId(),
                request.questionCountOrDefault(),
                request.difficulty());
        return toResponses(generated);
    }

    private String resolveSourceText(UUID collectionId, GenerateQuestionsRequest request) {
        boolean hasText = request.sourceText() != null && !request.sourceText().isBlank();
        boolean hasMaterial = request.sourceMaterialId() != null;

        if (hasText == hasMaterial) {
            throw new InvalidRequestException("Provide exactly one of sourceText or sourceMaterialId");
        }

        if (hasText) {
            return request.sourceText();
        }

        LearningMaterial material = materialRepository.findByIdAndCollectionId(request.sourceMaterialId(), collectionId)
                .orElseThrow(() -> new ResourceNotFoundException("Learning material not found"));

        if (material.getExtractionStatus() != ExtractionStatus.COMPLETED
                || material.getExtractedContent() == null
                || material.getExtractedContent().isBlank()) {
            throw new MaterialExtractionException("This material has no extracted text to generate from");
        }

        return material.getExtractedContent();
    }

    public List<QuestionResponse> list(UUID collectionId, UUID ownerId) {
        requireOwnedCollection(collectionId, ownerId);
        return toResponses(questionRepository.findAllByCollectionId(collectionId));
    }

    public QuestionResponse updateApproval(UUID questionId, UUID ownerId, ApprovalStatus newStatus) {
        Question question = questionRepository.findById(questionId)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        requireOwnedCollection(question.getCollectionId(), ownerId);

        question.setApprovalStatus(newStatus);
        questionRepository.save(question);

        return QuestionResponse.from(question, answerOptionRepository.findAllByQuestionId(question.getId()));
    }

    private void requireOwnedCollection(UUID collectionId, UUID ownerId) {
        collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }

    private List<QuestionResponse> toResponses(List<Question> questions) {
        if (questions.isEmpty()) {
            return List.of();
        }

        List<UUID> ids = questions.stream().map(Question::getId).toList();
        Map<UUID, List<AnswerOption>> optionsByQuestion = answerOptionRepository.findAllByQuestionIdIn(ids).stream()
                .collect(Collectors.groupingBy(AnswerOption::getQuestionId));

        return questions.stream()
                .map(question -> QuestionResponse.from(question, optionsByQuestion.getOrDefault(question.getId(), List.of())))
                .toList();
    }
}
