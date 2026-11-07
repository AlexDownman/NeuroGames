package com.neurogames.game;

import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.InvalidRequestException;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.game.dto.CreateGameRequest;
import com.neurogames.game.dto.GameResponse;
import com.neurogames.question.ApprovalStatus;
import com.neurogames.question.Question;
import com.neurogames.question.QuestionRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class GameService {

    // Mirrors the BBC show's escalating-value bank: early questions are
    // worth less, later ones worth more, capped so a long run doesn't
    // escalate forever.
    private static final int BASE_POINT_VALUE = 50;
    private static final int MAX_POINT_VALUE = 500;

    private final CollectionRepository collectionRepository;
    private final QuestionRepository questionRepository;
    private final GameRepository gameRepository;
    private final GameQuestionRepository gameQuestionRepository;

    public GameService(
            CollectionRepository collectionRepository,
            QuestionRepository questionRepository,
            GameRepository gameRepository,
            GameQuestionRepository gameQuestionRepository) {
        this.collectionRepository = collectionRepository;
        this.questionRepository = questionRepository;
        this.gameRepository = gameRepository;
        this.gameQuestionRepository = gameQuestionRepository;
    }

    public GameResponse createAnswerRunGame(UUID collectionId, UUID ownerId, CreateGameRequest request) {
        requireOwnedCollection(collectionId, ownerId);

        List<Question> questions = request.questionIds().stream()
                .map(id -> questionRepository.findByIdAndCollectionId(id, collectionId)
                        .orElseThrow(() -> new ResourceNotFoundException("Question not found in this collection: " + id)))
                .toList();

        for (Question question : questions) {
            if (question.getApprovalStatus() != ApprovalStatus.APPROVED) {
                throw new InvalidRequestException(
                        "Only approved questions can be added to a game (question " + question.getId() + " is not approved)");
            }
        }

        Game game = new Game();
        game.setCollectionId(collectionId);
        game.setTitle(request.title());
        game.setDescription(request.description());
        game.setGameType(GameType.ANSWER_RUN);
        Game savedGame = gameRepository.saveAndFlush(game);

        for (int index = 0; index < questions.size(); index++) {
            int pointValue = Math.min(BASE_POINT_VALUE * (index + 1), MAX_POINT_VALUE);

            GameQuestion gameQuestion = new GameQuestion();
            gameQuestion.setId(new GameQuestionId(savedGame.getId(), questions.get(index).getId()));
            gameQuestion.setDisplayOrder(index);
            gameQuestion.setMetadata("{\"pointValue\":" + pointValue + "}");
            gameQuestionRepository.save(gameQuestion);
        }

        return GameResponse.from(savedGame, questions.size());
    }

    public List<GameResponse> list(UUID collectionId, UUID ownerId) {
        requireOwnedCollection(collectionId, ownerId);
        return gameRepository.findAllByCollectionId(collectionId).stream()
                .map(game -> GameResponse.from(
                        game, gameQuestionRepository.findAllByIdGameIdOrderByDisplayOrder(game.getId()).size()))
                .toList();
    }

    private void requireOwnedCollection(UUID collectionId, UUID ownerId) {
        collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }
}
