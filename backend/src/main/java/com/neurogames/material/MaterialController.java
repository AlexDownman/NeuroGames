package com.neurogames.material;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.material.dto.LearningMaterialResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MaterialController {

    private final MaterialService materialService;

    public MaterialController(MaterialService materialService) {
        this.materialService = materialService;
    }

    @PostMapping("/api/collections/{collectionId}/materials")
    public ResponseEntity<LearningMaterialResponse> upload(
            @PathVariable UUID collectionId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal LecturerPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(materialService.upload(collectionId, principal.lecturerId(), file));
    }

    @GetMapping("/api/collections/{collectionId}/materials")
    public List<LearningMaterialResponse> list(
            @PathVariable UUID collectionId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return materialService.list(collectionId, principal.lecturerId());
    }
}
