package com.neurogames.auth;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LecturerRepository extends JpaRepository<Lecturer, UUID> {
}
