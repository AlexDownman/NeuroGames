package com.neurogames.game;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.game.dto.CreateGameRequest;
import com.neurogames.game.dto.GameResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    @PostMapping("/api/collections/{collectionId}/games")
    public ResponseEntity<GameResponse> create(
            @PathVariable UUID collectionId,
            @Valid @RequestBody CreateGameRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(gameService.createAnswerRunGame(collectionId, principal.lecturerId(), request));
    }

    @GetMapping("/api/collections/{collectionId}/games")
    public List<GameResponse> list(
            @PathVariable UUID collectionId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return gameService.list(collectionId, principal.lecturerId());
    }
}
