package com.neurogames.common;

import jakarta.persistence.AttributeConverter;

/** Shared base for enum columns stored as lowercase snake_case text (matching Postgres CHECK constraints). */
public abstract class LowercaseEnumConverter<T extends Enum<T>> implements AttributeConverter<T, String> {

    private final Class<T> enumType;

    protected LowercaseEnumConverter(Class<T> enumType) {
        this.enumType = enumType;
    }

    @Override
    public String convertToDatabaseColumn(T attribute) {
        return attribute == null ? null : attribute.name().toLowerCase();
    }

    @Override
    public T convertToEntityAttribute(String dbValue) {
        return dbValue == null ? null : Enum.valueOf(enumType, dbValue.toUpperCase());
    }
}
