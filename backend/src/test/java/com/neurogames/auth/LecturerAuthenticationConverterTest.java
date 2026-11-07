package com.neurogames.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

class LecturerAuthenticationConverterTest {

    private final LecturerRepository lecturerRepository = mock(LecturerRepository.class);
    private final LecturerAuthenticationConverter converter = new LecturerAuthenticationConverter(lecturerRepository);

    @Test
    void registeredLecturerBecomesPrincipal() {
        UUID id = UUID.randomUUID();
        when(lecturerRepository.existsById(id)).thenReturn(true);

        var auth = converter.convert(jwt(id.toString(), false));

        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(auth.getPrincipal()).isEqualTo(new LecturerPrincipal(id, "lecturer@example.com"));
    }

    @Test
    void anonymousStudentIsRejectedWithoutDatabaseLookup() {
        UUID id = UUID.randomUUID();

        assertThatThrownBy(() -> converter.convert(jwt(id.toString(), true)))
                .isInstanceOf(InvalidBearerTokenException.class);
        verify(lecturerRepository, never()).existsById(id);
    }

    @Test
    void signedInNonLecturerIsRejected() {
        UUID id = UUID.randomUUID();
        when(lecturerRepository.existsById(id)).thenReturn(false);

        assertThatThrownBy(() -> converter.convert(jwt(id.toString(), false)))
                .isInstanceOf(InvalidBearerTokenException.class);
    }

    @Test
    void nonUuidSubjectIsRejected() {
        assertThatThrownBy(() -> converter.convert(jwt("not-a-uuid", false)))
                .isInstanceOf(InvalidBearerTokenException.class);
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
