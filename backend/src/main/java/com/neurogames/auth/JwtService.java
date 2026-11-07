package com.neurogames.auth;

import com.neurogames.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * Verifies JWTs that Supabase Auth already issued — this backend never signs
 * its own. Lecturer registration/login happens entirely through Supabase Auth;
 * by the time a request reaches us, the token's signature and expiry are the
 * only things left to check.
 */
@Service
public class JwtService {

    private final SecretKey verificationKey;

    public JwtService(JwtProperties jwtProperties) {
        this.verificationKey = Keys.hmacShaKeyFor(jwtProperties.jwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    public LecturerPrincipal verify(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(verificationKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        UUID lecturerId = UUID.fromString(claims.getSubject());
        String email = claims.get("email", String.class);
        return new LecturerPrincipal(lecturerId, email);
    }
}
