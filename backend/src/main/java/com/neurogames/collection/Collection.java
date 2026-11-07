package com.neurogames.collection;

import com.neurogames.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "collections")
@Getter
@Setter
@NoArgsConstructor
public class Collection extends BaseEntity {

    @Column(name = "lecturer_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(name = "is_public", nullable = false)
    private boolean publicCollection = false;
}
