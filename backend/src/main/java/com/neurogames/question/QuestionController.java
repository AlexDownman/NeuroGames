package com.neurogames.question;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.question.dto.ApprovalUpdateRequest;
import com.neurogames.question.dto.GenerateQuestionsRequest;
import com.neurogames.question.dto.QuestionResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QuestionController {

    private final QuestionService questionService;

    public QuestionController(QuestionService questionService) {
        this.questionService = questionService;
    }

    @PostMapping("/api/collections/{collectionId}/questions/generate")
    public List<QuestionResponse> generate(
            @PathVariable UUID collectionId,
            @Valid @RequestBody GenerateQuestionsRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal) {
        return questionService.generate(collectionId, principal.lecturerId(), request);
    }

    @GetMapping("/api/collections/{collectionId}/questions")
    public List<QuestionResponse> list(
            @PathVariable UUID collectionId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return questionService.list(collectionId, principal.lecturerId());
    }

    @PatchMapping("/api/questions/{questionId}/approval")
    public QuestionResponse updateApproval(
            @PathVariable UUID questionId,
            @Valid @RequestBody ApprovalUpdateRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal) {
        ApprovalStatus status = ApprovalStatus.valueOf(request.status().toUpperCase(Locale.ROOT));
        return questionService.updateApproval(questionId, principal.lecturerId(), status);
    }
}
