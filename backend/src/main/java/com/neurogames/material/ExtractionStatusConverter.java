package com.neurogames.material;

import com.neurogames.common.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class ExtractionStatusConverter extends LowercaseEnumConverter<ExtractionStatus> {

    public ExtractionStatusConverter() {
        super(ExtractionStatus.class);
    }
}
