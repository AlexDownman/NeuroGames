package com.neurogames.game;

import com.neurogames.common.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class GameTypeConverter extends LowercaseEnumConverter<GameType> {

    public GameTypeConverter() {
        super(GameType.class);
    }
}
