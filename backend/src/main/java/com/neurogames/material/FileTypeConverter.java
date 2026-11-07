package com.neurogames.material;

import com.neurogames.common.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class FileTypeConverter extends LowercaseEnumConverter<FileType> {

    public FileTypeConverter() {
        super(FileType.class);
    }
}
