package com.neurogames.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Read-only from this backend's perspective: rows are created by a Postgres
 * trigger when a lecturer signs up through Supabase Auth (see
 * handle_new_lecturer() in database/schema.sql), so the id is never
 * generated here — it equals the Supabase auth.users id from the JWT "sub" claim.
 */
@Entity
@Table(name = "lecturers")
@Getter
@Setter
@NoArgsConstructor
public class Lecturer {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String fullName;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;
}
