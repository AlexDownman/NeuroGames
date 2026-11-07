package com.neurogames.auth;

import java.util.Collection;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * An authenticated teacher: a LecturerPrincipal plus the verified Supabase JWT.
 *
 * Not a UsernamePasswordAuthenticationToken because Spring Security erases
 * that token's credentials once authentication completes, and the raw JWT is
 * still needed afterwards — calls to Supabase Storage are made as the teacher.
 */
public class TeacherAuthenticationToken extends AbstractAuthenticationToken {

    private final LecturerPrincipal principal;
    private final Jwt token;

    public TeacherAuthenticationToken(
            LecturerPrincipal principal, Jwt token, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.principal = principal;
        this.token = token;
        setAuthenticated(true);
    }

    @Override
    public LecturerPrincipal getPrincipal() {
        return principal;
    }

    @Override
    public Jwt getCredentials() {
        return token;
    }
}
