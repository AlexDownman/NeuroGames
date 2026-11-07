package com.neurogames.collection.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * publicCollection is a boxed Boolean so clients may omit it: Jackson 3
 * rejects a missing primitive outright (FAIL_ON_NULL_FOR_PRIMITIVES).
 */
public record CollectionRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 2000) String description,
        Boolean publicCollection) {

    public boolean isPublic() {
        return Boolean.TRUE.equals(publicCollection);
    }
}
