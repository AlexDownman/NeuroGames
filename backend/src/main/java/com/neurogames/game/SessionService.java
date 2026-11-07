package com.neurogames.game;

import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.game.dto.GameSessionResponse;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SessionService {

    // No 0/O/1/I — avoids codes students misread when a teacher reads them aloud.
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final CollectionRepository collectionRepository;
    private final GameRepository gameRepository;
    private final GameSessionRepository sessionRepository;
    private final SecureRandom random = new SecureRandom();

    public SessionService(
            CollectionRepository collectionRepository,
            GameRepository gameRepository,
            GameSessionRepository sessionRepository) {
        this.collectionRepository = collectionRepository;
        this.gameRepository = gameRepository;
        this.sessionRepository = sessionRepository;
    }

    public GameSessionResponse start(UUID gameId, UUID ownerId) {
        Game game = requireOwnedGame(gameId, ownerId);

        GameSession session = new GameSession();
        session.setGameId(game.getId());
        session.setSessionCode(generateUniqueSessionCode());
        session.setStatus(SessionStatus.ACTIVE);
        session.setStartedAt(Instant.now());

        return GameSessionResponse.from(sessionRepository.saveAndFlush(session));
    }

    public GameSessionResponse end(UUID sessionId, UUID ownerId) {
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found"));
        requireOwnedGame(session.getGameId(), ownerId);

        session.setStatus(SessionStatus.ENDED);
        session.setEndedAt(Instant.now());

        return GameSessionResponse.from(sessionRepository.saveAndFlush(session));
    }

    public List<GameSessionResponse> list(UUID gameId, UUID ownerId) {
        requireOwnedGame(gameId, ownerId);
        return sessionRepository.findAllByGameId(gameId).stream().map(GameSessionResponse::from).toList();
    }

    private Game requireOwnedGame(UUID gameId, UUID ownerId) {
        Game game = gameRepository.findById(gameId).orElseThrow(() -> new ResourceNotFoundException("Game not found"));
        collectionRepository.findByIdAndOwnerId(game.getCollectionId(), ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Game not found"));
        return game;
    }

    private String generateUniqueSessionCode() {
        String code;
        do {
            code = generateCode();
        } while (sessionRepository.existsBySessionCode(code));
        return code;
    }

    private String generateCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        }
        return code.toString();
    }
}
