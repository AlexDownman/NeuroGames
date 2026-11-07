package com.neurogames.question;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** DB stores lowercase snake_case ('pending_review'); Java uses the enum's natural name. */
@Converter(autoApply = true)
public class ApprovalStatusConverter implements AttributeConverter<ApprovalStatus, String> {

    @Override
    public String convertToDatabaseColumn(ApprovalStatus status) {
        return status == null ? null : status.name().toLowerCase();
    }

    @Override
    public ApprovalStatus convertToEntityAttribute(String dbValue) {
        return dbValue == null ? null : ApprovalStatus.valueOf(dbValue.toUpperCase());
    }
}
