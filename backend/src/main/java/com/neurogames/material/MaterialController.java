package com.neurogames.material;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.material.dto.LearningMaterialResponse;
import com.neurogames.material.dto.MaterialDownloadResponse;
import com.neurogames.material.dto.MaterialUploadUrlRequest;
import com.neurogames.material.dto.MaterialUploadUrlResponse;
import com.neurogames.material.dto.RegisterMaterialRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MaterialController {

    private final MaterialService materialService;

    public MaterialController(MaterialService materialService) {
        this.materialService = materialService;
    }

    // Uploads are two calls: get a signed URL, PUT the file to Supabase Storage
    // from the browser, then register it here. File bytes never pass through
    // this API, whose request bodies Vercel caps at 4.5 MB.
    @PostMapping("/api/collections/{collectionId}/materials/upload-url")
    public MaterialUploadUrlResponse uploadUrl(
            @PathVariable UUID collectionId,
            @Valid @RequestBody MaterialUploadUrlRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal,
            Authentication authentication) {
        return materialService.createUploadUrl(
                collectionId, principal.lecturerId(), accessToken(authentication), request.filename());
    }

    @PostMapping("/api/collections/{collectionId}/materials")
    public ResponseEntity<LearningMaterialResponse> register(
            @PathVariable UUID collectionId,
            @Valid @RequestBody RegisterMaterialRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal,
            Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(materialService.register(
                        collectionId, principal.lecturerId(), accessToken(authentication),
                        request.storagePath(), request.filename()));
    }

    @GetMapping("/api/collections/{collectionId}/materials")
    public List<LearningMaterialResponse> list(
            @PathVariable UUID collectionId, @AuthenticationPrincipal LecturerPrincipal principal) {
        return materialService.list(collectionId, principal.lecturerId());
    }

    @GetMapping("/api/collections/{collectionId}/materials/{materialId}/download-url")
    public MaterialDownloadResponse downloadUrl(
            @PathVariable UUID collectionId,
            @PathVariable UUID materialId,
            @AuthenticationPrincipal LecturerPrincipal principal,
            Authentication authentication) {
        return materialService.downloadUrl(collectionId, materialId, principal.lecturerId(), accessToken(authentication));
    }

    // Storage calls are made as the teacher, so they need the raw token that
    // LecturerAuthenticationConverter keeps as the Authentication's credentials.
    private static String accessToken(Authentication authentication) {
        if (authentication.getCredentials() instanceof Jwt jwt) {
            return jwt.getTokenValue();
        }
        throw new IllegalStateException("Authenticated request has no bearer token");
    }
}
