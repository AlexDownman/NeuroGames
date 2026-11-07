package com.neurogames.game;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.game.dto.GameSessionResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping("/api/games/{gameId}/sessions")
    public ResponseEntity<GameSessionResponse> start(
            @PathVariable UUID gameId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(sessionService.start(gameId, principal.lecturerId()));
    }

    @GetMapping("/api/games/{gameId}/sessions")
    public List<GameSessionResponse> list(
            @PathVariable UUID gameId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return sessionService.list(gameId, principal.lecturerId());
    }

    @PatchMapping("/api/sessions/{sessionId}/end")
    public GameSessionResponse end(
            @PathVariable UUID sessionId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return sessionService.end(sessionId, principal.lecturerId());
    }
}
