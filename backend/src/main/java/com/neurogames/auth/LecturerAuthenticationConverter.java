package com.neurogames.auth;

import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Component;

/**
 * Turns an already-verified Supabase JWT into a LecturerPrincipal.
 *
 * Signature, expiry, issuer and audience are checked by Spring's resource
 * server before this runs (see the spring.security.oauth2 block in
 * application.yml). What's left is "is this caller actually a lecturer?":
 * students also hold valid Supabase tokens (anonymous sign-ins), so a good
 * signature alone isn't enough. A caller counts as a lecturer only if
 * handle_new_lecturer() created a public.lecturers row for them.
 */
@Component
public class LecturerAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final LecturerRepository lecturerRepository;

    public LecturerAuthenticationConverter(LecturerRepository lecturerRepository) {
        this.lecturerRepository = lecturerRepository;
    }

    @Override
    public AbstractAuthenticationToken convert(@NonNull Jwt jwt) {
        if (Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"))) {
            throw new InvalidBearerTokenException("Anonymous users cannot access the lecturer API");
        }

        UUID lecturerId;
        try {
            lecturerId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new InvalidBearerTokenException("Token subject is not a valid user id");
        }

        if (!lecturerRepository.existsById(lecturerId)) {
            throw new InvalidBearerTokenException("Caller is not a registered lecturer");
        }

        var principal = new LecturerPrincipal(lecturerId, jwt.getClaimAsString("email"));
        return UsernamePasswordAuthenticationToken.authenticated(principal, jwt, List.of());
    }
}
