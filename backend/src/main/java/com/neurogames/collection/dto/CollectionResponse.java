package com.neurogames.collection.dto;

import java.time.Instant;
import java.util.UUID;

public record CollectionResponse(
        UUID id,
        String name,
        String description,
        boolean publicCollection,
        Instant createdAt,
        Instant updatedAt) {

    public static CollectionResponse from(com.neurogames.collection.Collection collection) {
        return new CollectionResponse(
                collection.getId(),
                collection.getName(),
                collection.getDescription(),
                collection.isPublicCollection(),
                collection.getCreatedAt(),
                collection.getUpdatedAt());
    }
}
