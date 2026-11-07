package com.neurogames.game;

import com.neurogames.common.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class SessionStatusConverter extends LowercaseEnumConverter<SessionStatus> {

    public SessionStatusConverter() {
        super(SessionStatus.class);
    }
}
