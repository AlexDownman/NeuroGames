package com.neurogames.ai;

import com.neurogames.ai.dto.GeneratedQuestion;
import com.neurogames.question.QuestionRepository;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Fulfills the "Content Validation" role with plain, free, deterministic
 * checks instead of a second LLM call: duplicate detection and schema-shape
 * checks are reliable as code and don't need another API round trip.
 * Judgment calls an LLM would genuinely be needed for (factual accuracy,
 * ambiguity) aren't done here — this only screens out malformed or
 * already-seen questions before they're persisted.
 */
@Service
public class QuestionValidationService {

    private static final Set<String> ALLOWED_DIFFICULTIES = Set.of("easy", "medium", "hard");
    private static final int MIN_ANSWER_OPTIONS = 2;
    private static final int MAX_ANSWER_OPTIONS = 5;

    private final QuestionRepository questionRepository;

    public QuestionValidationService(QuestionRepository questionRepository) {
        this.questionRepository = questionRepository;
    }

    public boolean isValid(UUID collectionId, GeneratedQuestion candidate) {
        if (isBlank(candidate.questionText) || isBlank(candidate.explanation)) {
            return false;
        }

        if (candidate.difficulty == null || !ALLOWED_DIFFICULTIES.contains(candidate.difficulty.toLowerCase())) {
            return false;
        }

        if (candidate.answerOptions == null
                || candidate.answerOptions.size() < MIN_ANSWER_OPTIONS
                || candidate.answerOptions.size() > MAX_ANSWER_OPTIONS) {
            return false;
        }

        boolean anyBlankOption = candidate.answerOptions.stream().anyMatch(option -> isBlank(option.text));
        if (anyBlankOption) {
            return false;
        }

        long correctCount = candidate.answerOptions.stream().filter(option -> option.isCorrect).count();
        if (correctCount != 1) {
            return false;
        }

        return !questionRepository.existsByCollectionIdAndQuestionText(collectionId, candidate.questionText.strip());
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
