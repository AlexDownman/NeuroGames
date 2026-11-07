package com.neurogames.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

class LecturerAuthenticationConverterTest {

    private final LecturerRepository lecturerRepository = mock(LecturerRepository.class);
    private final LecturerAuthenticationConverter converter = new LecturerAuthenticationConverter(lecturerRepository);

    @Test
    void registeredLecturerGetsTeacherRoleAndPrincipal() {
        UUID id = UUID.randomUUID();
        when(lecturerRepository.existsById(id)).thenReturn(true);

        var auth = converter.convert(jwt(id.toString(), false));

        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(roles(auth)).containsExactly("ROLE_TEACHER");
        assertThat(auth.getPrincipal()).isEqualTo(new LecturerPrincipal(id, "lecturer@example.com"));
    }

    @Test
    void anonymousStudentIsAuthenticatedWithoutRolesOrDatabaseLookup() {
        UUID id = UUID.randomUUID();

        var auth = converter.convert(jwt(id.toString(), true));

        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(roles(auth)).isEmpty();
        assertThat(auth.getName()).isEqualTo(id.toString());
        verify(lecturerRepository, never()).existsById(any());
    }

    @Test
    void signedInNonLecturerIsAuthenticatedWithoutRoles() {
        UUID id = UUID.randomUUID();
        when(lecturerRepository.existsById(id)).thenReturn(false);

        var auth = converter.convert(jwt(id.toString(), false));

        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(roles(auth)).isEmpty();
    }

    @Test
    void nonUuidSubjectIsRejected() {
        assertThatThrownBy(() -> converter.convert(jwt("not-a-uuid", false)))
                .isInstanceOf(InvalidBearerTokenException.class);
    }

    private static java.util.List<String> roles(Authentication auth) {
        return auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    }

    private static Jwt jwt(String subject, boolean anonymous) {
        return Jwt.withTokenValue("token")
                .header("alg", "ES256")
                .subject(subject)
                .claim("email", "lecturer@example.com")
                .claim("is_anonymous", anonymous)
                .build();
    }
}
