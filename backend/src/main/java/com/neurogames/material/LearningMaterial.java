package com.neurogames.material;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "learning_materials")
@Getter
@Setter
@NoArgsConstructor
public class LearningMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "collection_id", nullable = false)
    private UUID collectionId;

    @Column(nullable = false)
    private String filename;

    // No object storage wired up yet — the original file isn't retained,
    // only its extracted text. This holds the original filename as a
    // placeholder until real file storage (e.g. Supabase Storage) lands.
    @Column(name = "storage_path", nullable = false)
    private String storagePath;

    @Column(name = "file_type", nullable = false)
    private FileType fileType;

    @Column(name = "extraction_status", nullable = false)
    private ExtractionStatus extractionStatus = ExtractionStatus.PENDING;

    @Column(name = "extracted_content", columnDefinition = "text")
    private String extractedContent;

    @CreationTimestamp
    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;
}
