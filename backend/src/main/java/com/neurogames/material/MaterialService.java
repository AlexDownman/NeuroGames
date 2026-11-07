package com.neurogames.material;

import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.material.dto.LearningMaterialResponse;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class MaterialService {

    private final CollectionRepository collectionRepository;
    private final LearningMaterialRepository materialRepository;
    private final MaterialTextExtractor extractor;

    public MaterialService(
            CollectionRepository collectionRepository,
            LearningMaterialRepository materialRepository,
            MaterialTextExtractor extractor) {
        this.collectionRepository = collectionRepository;
        this.materialRepository = materialRepository;
        this.extractor = extractor;
    }

    public LearningMaterialResponse upload(UUID collectionId, UUID ownerId, MultipartFile file) {
        requireOwnedCollection(collectionId, ownerId);

        if (file.isEmpty()) {
            throw new MaterialExtractionException("Uploaded file is empty");
        }

        // Unsupported type: reject outright, no row created.
        FileType fileType = extractor.detectFileType(file.getOriginalFilename());

        LearningMaterial material = new LearningMaterial();
        material.setCollectionId(collectionId);
        material.setFilename(file.getOriginalFilename());
        material.setStoragePath(file.getOriginalFilename());
        material.setFileType(fileType);

        // Supported type, but the file itself is unreadable/corrupt: keep a
        // record with FAILED status rather than losing the upload attempt.
        try (InputStream input = file.getInputStream()) {
            material.setExtractedContent(extractor.extractText(input));
            material.setExtractionStatus(ExtractionStatus.COMPLETED);
        } catch (IOException | MaterialExtractionException ex) {
            material.setExtractionStatus(ExtractionStatus.FAILED);
        }

        return LearningMaterialResponse.from(materialRepository.saveAndFlush(material));
    }

    public List<LearningMaterialResponse> list(UUID collectionId, UUID ownerId) {
        requireOwnedCollection(collectionId, ownerId);
        return materialRepository.findAllByCollectionId(collectionId).stream()
                .map(LearningMaterialResponse::from)
                .toList();
    }

    private void requireOwnedCollection(UUID collectionId, UUID ownerId) {
        collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }
}
