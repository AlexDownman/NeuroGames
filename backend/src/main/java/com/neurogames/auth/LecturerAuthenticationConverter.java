package com.neurogames.auth;

import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Turns an already-verified Supabase JWT into an Authentication, deciding
 * whether the caller is a teacher.
 *
 * Signature, expiry, issuer and audience are checked by Spring's resource
 * server before this runs (see the spring.security.oauth2 block in
 * application.yml). Every token that gets this far is authenticated; only
 * lecturers — callers with a public.lecturers row, created by
 * handle_new_lecturer() for email signups — are granted ROLE_TEACHER, with a
 * LecturerPrincipal. Anyone else (e.g. a student's anonymous sign-in) is
 * authenticated with no roles, so SecurityConfig answers them 403, not 401.
 */
@Component
public class LecturerAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    public static final String TEACHER_ROLE = "TEACHER";

    private final LecturerRepository lecturerRepository;

    public LecturerAuthenticationConverter(LecturerRepository lecturerRepository) {
        this.lecturerRepository = lecturerRepository;
    }

    @Override
    public AbstractAuthenticationToken convert(@NonNull Jwt jwt) {
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new InvalidBearerTokenException("Token subject is not a valid user id");
        }

        // Anonymous sign-ins never get a lecturers row; skip the lookup.
        boolean anonymous = Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"));
        if (anonymous || !lecturerRepository.existsById(userId)) {
            return new JwtAuthenticationToken(jwt, List.of(), userId.toString());
        }

        var principal = new LecturerPrincipal(userId, jwt.getClaimAsString("email"));
        return UsernamePasswordAuthenticationToken.authenticated(
                principal, jwt, List.of(new SimpleGrantedAuthority("ROLE_" + TEACHER_ROLE)));
    }
}
