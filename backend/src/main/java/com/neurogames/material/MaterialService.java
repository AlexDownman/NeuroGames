package com.neurogames.material;

import com.neurogames.collection.CollectionRepository;
import com.neurogames.common.exception.InvalidRequestException;
import com.neurogames.common.exception.ResourceNotFoundException;
import com.neurogames.config.StorageProperties;
import com.neurogames.material.dto.LearningMaterialResponse;
import com.neurogames.material.dto.MaterialDownloadResponse;
import com.neurogames.material.dto.MaterialUploadUrlResponse;
import com.neurogames.storage.ResourceStorageClient;
import com.neurogames.storage.ResourceStorageClient.StoredObjectNotFoundException;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MaterialService {

    private static final int MAX_STORED_NAME_LENGTH = 100;
    private static final Pattern UPLOAD_PATH = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
                    + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
                    + "[A-Za-z0-9-][A-Za-z0-9._-]{0," + (MAX_STORED_NAME_LENGTH - 1) + "}");

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

    /**
     * Step 1 of an upload: the browser PUTs the file straight to storage at
     * the returned URL, then calls {@link #register}. Unsupported types are
     * rejected here, before anything is stored.
     */
    @Transactional(readOnly = true)
    public MaterialUploadUrlResponse createUploadUrl(UUID collectionId, UUID ownerId, String userToken, String filename) {
        requireOwnedCollection(collectionId, ownerId);
        extractor.detectFileType(filename);

        String path = storagePath(collectionId, filename);
        String uploadUrl = storageClient.createSignedUploadUrl(userToken, path).toString();
        return new MaterialUploadUrlResponse(uploadUrl, path);
    }

    /** Step 2: read the uploaded object back, extract its text and record it. */
    public LearningMaterialResponse register(
            UUID collectionId, UUID ownerId, String userToken, String path, String filename) {
        requireOwnedCollection(collectionId, ownerId);

        // Only paths createUploadUrl could have issued for this collection;
        // the bucket's RLS would refuse others anyway, this just fails clearly.
        if (!isUploadPathFor(collectionId, path)) {
            throw new InvalidRequestException("That upload doesn't belong to this collection");
        }
        if (materialRepository.existsByStoragePath(path)) {
            throw new InvalidRequestException("That upload has already been added");
        }

        // Typed from the stored name, which kept the extension createUploadUrl checked.
        FileType fileType = extractor.detectFileType(path);

        byte[] content;
        try {
            content = storageClient.download(userToken, path);
        } catch (StoredObjectNotFoundException ex) {
            throw new InvalidRequestException("The uploaded file wasn't found — please try uploading again");
        }
        if (content.length == 0) {
            storageClient.deleteQuietly(userToken, path);
            throw new MaterialExtractionException("Uploaded file is empty");
        }

        LearningMaterial material = new LearningMaterial();
        material.setCollectionId(collectionId);
        material.setFilename(filename);
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

    /** True if path has the exact shape {@link #storagePath} produces for this collection. */
    static boolean isUploadPathFor(UUID collectionId, String path) {
        return path != null && UPLOAD_PATH.matcher(path).matches()
                && path.startsWith(collectionId + "/");
    }

    private void requireOwnedCollection(UUID collectionId, UUID ownerId) {
        collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }
}
