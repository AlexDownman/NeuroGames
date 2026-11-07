package com.neurogames.material;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import org.apache.tika.Tika;
import org.apache.tika.exception.TikaException;
import org.springframework.stereotype.Service;

/** Thin wrapper around Tika so the rest of the app never imports it directly. */
@Service
public class MaterialTextExtractor {

    // Bounds both memory use on a pathological file and, downstream, how much
    // text gets sent to OpenAI for question generation.
    private static final int MAX_EXTRACTED_CHARS = 500_000;

    private final Tika tika;

    public MaterialTextExtractor() {
        this.tika = new Tika();
        this.tika.setMaxStringLength(MAX_EXTRACTED_CHARS);
    }

    public FileType detectFileType(String filename) {
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) {
            return FileType.PDF;
        }
        if (lower.endsWith(".pptx")) {
            return FileType.PPTX;
        }
        if (lower.endsWith(".txt")) {
            return FileType.TEXT;
        }
        throw new MaterialExtractionException("Unsupported file type — only PDF, PPTX and TXT are accepted");
    }

    public String extractText(InputStream input) {
        try {
            String text = tika.parseToString(input);
            if (text == null || text.isBlank()) {
                throw new MaterialExtractionException("No readable text found in this file");
            }
            return text;
        } catch (IOException | TikaException ex) {
            throw new MaterialExtractionException("Failed to extract text from the uploaded file", ex);
        }
    }
}
