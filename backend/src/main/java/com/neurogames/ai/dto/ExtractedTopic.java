package com.neurogames.ai.dto;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;

public class ExtractedTopic {

    @JsonPropertyDescription("A short name for this topic or concept, e.g. 'Inheritance'.")
    public String name;

    @JsonPropertyDescription("One sentence describing what this topic covers, grounded in the source material.")
    public String description;
}
