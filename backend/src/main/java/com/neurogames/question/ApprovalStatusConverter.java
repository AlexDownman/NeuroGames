package com.neurogames.question;

import com.neurogames.common.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class ApprovalStatusConverter extends LowercaseEnumConverter<ApprovalStatus> {

    public ApprovalStatusConverter() {
        super(ApprovalStatus.class);
    }
}
