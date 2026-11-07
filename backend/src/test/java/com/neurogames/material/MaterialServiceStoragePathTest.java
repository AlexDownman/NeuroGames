package com.neurogames.material;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class MaterialServiceStoragePathTest {

    private static final UUID COLLECTION = UUID.fromString("11111111-2222-4333-8444-555555555555");

    @Test
    void pathStartsWithCollectionFolderAndKeepsSafeName() {
        assertThat(MaterialService.storagePath(COLLECTION, "lecture-01.pdf"))
                .matches(COLLECTION + "/[0-9a-f-]{36}/lecture-01\\.pdf");
    }

    @Test
    void unsafeCharactersAndDirectoriesAreStripped() {
        assertThat(MaterialService.storagePath(COLLECTION, "../../etc/Week 3: Synapses (final).pptx"))
                .endsWith("/Week_3_Synapses_final_.pptx")
                .doesNotContain("..");
        assertThat(MaterialService.storagePath(COLLECTION, "C:\\Users\\me\\notes.txt")).endsWith("/notes.txt");
    }

    @Test
    void emptyOrUnusableNamesFallBackToFile() {
        assertThat(MaterialService.storagePath(COLLECTION, null)).endsWith("/file");
        assertThat(MaterialService.storagePath(COLLECTION, "...")).endsWith("/file");
    }

    @Test
    void sameNameUploadsGetDistinctPaths() {
        assertThat(MaterialService.storagePath(COLLECTION, "a.txt"))
                .isNotEqualTo(MaterialService.storagePath(COLLECTION, "a.txt"));
    }
}
