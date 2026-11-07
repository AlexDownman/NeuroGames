package com.neurogames.material.dto;

import com.neurogames.material.LearningMaterial;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public record LearningMaterialResponse(
        UUID id,
        String filename,
        String fileType,
        String extractionStatus,
        boolean hasExtractedContent,
        Instant uploadedAt) {

    public static LearningMaterialResponse from(LearningMaterial material) {
        return new LearningMaterialResponse(
                material.getId(),
                material.getFilename(),
                material.getFileType().name().toLowerCase(Locale.ROOT),
                material.getExtractionStatus().name().toLowerCase(Locale.ROOT),
                material.getExtractedContent() != null && !material.getExtractedContent().isBlank(),
                material.getUploadedAt());
    }
}
