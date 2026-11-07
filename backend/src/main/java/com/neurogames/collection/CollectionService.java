package com.neurogames.collection;

import com.neurogames.collection.dto.CollectionRequest;
import com.neurogames.collection.dto.CollectionResponse;
import com.neurogames.common.exception.ResourceNotFoundException;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CollectionService {

    private final CollectionRepository collectionRepository;

    public CollectionService(CollectionRepository collectionRepository) {
        this.collectionRepository = collectionRepository;
    }

    public List<CollectionResponse> listForOwner(UUID ownerId) {
        return collectionRepository.findAllByOwnerId(ownerId).stream()
                .map(CollectionResponse::from)
                .toList();
    }

    public CollectionResponse get(UUID collectionId, UUID ownerId) {
        return CollectionResponse.from(requireOwnedCollection(collectionId, ownerId));
    }

    public CollectionResponse create(CollectionRequest request, UUID ownerId) {
        Collection collection = new Collection();
        collection.setOwnerId(ownerId);
        collection.setName(request.name());
        collection.setDescription(request.description());
        collection.setPublicCollection(request.isPublic());

        // flush, not just save: @CreationTimestamp/@UpdateTimestamp are only
        // populated in-memory when Hibernate actually issues the INSERT, which
        // a plain save() can defer until transaction commit — after this
        // method has already built the response from a still-null field.
        return CollectionResponse.from(collectionRepository.saveAndFlush(collection));
    }

    public CollectionResponse update(UUID collectionId, CollectionRequest request, UUID ownerId) {
        Collection collection = requireOwnedCollection(collectionId, ownerId);

        collection.setName(request.name());
        collection.setDescription(request.description());
        collection.setPublicCollection(request.isPublic());

        return CollectionResponse.from(collectionRepository.saveAndFlush(collection));
    }

    public void delete(UUID collectionId, UUID ownerId) {
        collectionRepository.delete(requireOwnedCollection(collectionId, ownerId));
    }

    private Collection requireOwnedCollection(UUID collectionId, UUID ownerId) {
        return collectionRepository.findByIdAndOwnerId(collectionId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Collection not found"));
    }
}
