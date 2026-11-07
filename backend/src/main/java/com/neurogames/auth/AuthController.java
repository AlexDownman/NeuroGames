package com.neurogames.auth;

import com.neurogames.auth.dto.LecturerResponse;
import com.neurogames.common.exception.ResourceNotFoundException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final LecturerRepository lecturerRepository;

    public AuthController(LecturerRepository lecturerRepository) {
        this.lecturerRepository = lecturerRepository;
    }

    @GetMapping("/me")
    public LecturerResponse me(@AuthenticationPrincipal LecturerPrincipal principal) {
        Lecturer lecturer = lecturerRepository.findById(principal.lecturerId())
                .orElseThrow(() -> new ResourceNotFoundException("Lecturer not found"));
        return LecturerResponse.from(lecturer);
    }
}
