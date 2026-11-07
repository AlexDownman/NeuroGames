package com.neurogames.material;

import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.config.StorageProperties;
import com.neurogames.material.dto.LearningMaterialResponse;
import com.neurogames.material.dto.MaterialDownloadResponse;
import com.neurogames.storage.ResourceStorageClient;
import com.neurogames.storage.ResourceStorageClient.StoredObjectNotFoundException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class MaterialService {

    private static final int MAX_STORED_NAME_LENGTH = 100;

    private final CollectionRepository collectionRepository;
    private final LearningMaterialRepository materialRepository;
    private final MaterialTextExtractor extractor;
    private final ResourceStorageClient storageClient;
    private final StorageProperties storageProperties;

    public MaterialService(
            CollectionRepository collectionRepository,
            LearningMaterialRepository materialRepository,
            MaterialTextExtractor extractor,
            ResourceStorageClient storageClient,
            StorageProperties storageProperties) {
        this.collectionRepository = collectionRepository;
        this.materialRepository = materialRepository;
        this.extractor = extractor;
        this.storageClient = storageClient;
        this.storageProperties = storageProperties;
    }

    public LearningMaterialResponse upload(UUID collectionId, UUID ownerId, String userToken, MultipartFile file) {
        requireOwnedCollection(collectionId, ownerId);

        if (file.isEmpty()) {
            throw new MaterialExtractionException("Uploaded file is empty");
        }

        // Unsupported type: reject outright, nothing stored, no row created.
        FileType fileType = extractor.detectFileType(file.getOriginalFilename());

        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException ex) {
            throw new MaterialExtractionException("Couldn't read the uploaded file", ex);
        }

        // Keep the original in object storage first: if that fails, nothing is saved.
        String path = storagePath(collectionId, file.getOriginalFilename());
        storageClient.upload(userToken, path, contentType(fileType), content);

        LearningMaterial material = new LearningMaterial();
        material.setCollectionId(collectionId);
        material.setFilename(file.getOriginalFilename());
        material.setStoragePath(path);
        material.setFileType(fileType);

        // Supported type, but the file itself is unreadable/corrupt: keep a
        // record with FAILED status rather than losing the upload attempt.
        try {
            material.setExtractedContent(extractor.extractText(new ByteArrayInputStream(content)));
            material.setExtractionStatus(ExtractionStatus.COMPLETED);
        } catch (MaterialExtractionException ex) {
            material.setExtractionStatus(ExtractionStatus.FAILED);
        }

        try {
            return LearningMaterialResponse.from(materialRepository.saveAndFlush(material));
        } catch (RuntimeException ex) {
            storageClient.deleteQuietly(userToken, path);
            throw ex;
        }
    }

    public List<LearningMaterialResponse> list(UUID collectionId, UUID ownerId) {
        requireOwnedCollection(collectionId, ownerId);
        return materialRepository.findAllByCollectionId(collectionId).stream()
                .map(LearningMaterialResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public MaterialDownloadResponse downloadUrl(UUID collectionId, UUID materialId, UUID ownerId, String userToken) {
        requireOwnedCollection(collectionId, ownerId);
        LearningMaterial material = materialRepository.findByIdAndCollectionId(materialId, collectionId)
                .orElseThrow(() -> new ResourceNotFoundException("Material not found"));

        if (!material.isFileStored()) {
            throw new ResourceNotFoundException("The original file wasn't kept for this upload");
        }

        try {
            String url = storageClient.createSignedUrl(userToken, material.getStoragePath()).toString();
            Instant expiresAt = Instant.now().plus(storageProperties.signedUrlTtl());
            return new MaterialDownloadResponse(url, material.getFilename(), expiresAt);
        } catch (StoredObjectNotFoundException ex) {
            throw new ResourceNotFoundException("The stored file for this material is missing");
        }
    }

    /**
     * {collectionId}/{random uuid}/{sanitised filename}. The first folder is
     * what the bucket's RLS policies check ownership against; the uuid keeps
     * same-named uploads apart; the name is restricted to URL-safe characters
     * so the path can be used verbatim in Storage API URLs.
     */
    static String storagePath(UUID collectionId, String originalFilename) {
        String name = originalFilename == null ? "" : originalFilename.replaceAll(".*[/\\\\]", "");
        name = name.replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("^[._]+", "");
        if (name.length() > MAX_STORED_NAME_LENGTH) {
            name = name.substring(name.length() - MAX_STORED_NAME_LENGTH);
        }
        if (name.isBlank()) {
            name = "file";
        }
        return collectionId + "/" + UUID.randomUUID() + "/" + name;
    }

    private static String contentType(FileType fileType) {
        return switch (fileType) {
            case PDF -> "application/pdf";
            case DOCX -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case PPTX -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case TEXT -> "text/plain";
        };
    }

    private void requireOwnedCollection(UUID collectionId, UUID ownerId) {
        collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }
}
