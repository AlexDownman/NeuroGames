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

        // Flush, not save: Hibernate only fills @CreationTimestamp/@UpdateTimestamp
        // at flush time, which would otherwise be after the response is built.
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
