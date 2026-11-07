package com.neurogames.question;

import com.neurogames.ai.QuestionGenerationOrchestrator;
import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.ResourceNotFoundException;
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
    private final QuestionGenerationOrchestrator orchestrator;

    public QuestionService(
            CollectionRepository collectionRepository,
            QuestionRepository questionRepository,
            AnswerOptionRepository answerOptionRepository,
            QuestionGenerationOrchestrator orchestrator) {
        this.collectionRepository = collectionRepository;
        this.questionRepository = questionRepository;
        this.answerOptionRepository = answerOptionRepository;
        this.orchestrator = orchestrator;
    }

    public List<QuestionResponse> generate(UUID collectionId, UUID ownerId, GenerateQuestionsRequest request) {
        requireOwnedCollection(collectionId, ownerId);
        List<Question> generated = orchestrator.generate(
                collectionId, request.sourceText(), request.questionCountOrDefault(), request.difficulty());
        return toResponses(generated);
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
