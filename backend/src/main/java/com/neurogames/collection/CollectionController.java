package com.neurogames.collection;

import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.collection.dto.CollectionRequest;
import com.neurogames.collection.dto.CollectionResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/collections")
public class CollectionController {

    private final CollectionService collectionService;

    public CollectionController(CollectionService collectionService) {
        this.collectionService = collectionService;
    }

    @GetMapping
    public List<CollectionResponse> list(@AuthenticationPrincipal LecturerPrincipal principal) {
        return collectionService.listForOwner(principal.lecturerId());
    }

    @GetMapping("/{id}")
    public CollectionResponse get(@PathVariable UUID id, @AuthenticationPrincipal LecturerPrincipal principal) {
        return collectionService.get(id, principal.lecturerId());
    }

    @PostMapping
    public ResponseEntity<CollectionResponse> create(
            @Valid @RequestBody CollectionRequest request, @AuthenticationPrincipal LecturerPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(collectionService.create(request, principal.lecturerId()));
    }

    @PutMapping("/{id}")
    public CollectionResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody CollectionRequest request,
            @AuthenticationPrincipal LecturerPrincipal principal) {
        return collectionService.update(id, request, principal.lecturerId());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, @AuthenticationPrincipal LecturerPrincipal principal) {
        collectionService.delete(id, principal.lecturerId());
        return ResponseEntity.noContent().build();
    }
}
