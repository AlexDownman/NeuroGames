package com.neurogames.collection;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.neurogames.auth.LecturerAuthenticationConverter;
import com.neurogames.auth.LecturerPrincipal;
import com.neurogames.auth.LecturerRepository;
import com.neurogames.collection.dto.CollectionResponse;
import com.neurogames.config.SecurityConfig;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(controllers = CollectionController.class, properties = "SUPABASE_URL=https://test.supabase.co")
@Import({SecurityConfig.class, LecturerAuthenticationConverter.class})
class CollectionControllerTest {

    private static final UUID LECTURER_ID = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CollectionService collectionService;

    @MockitoBean
    private LecturerRepository lecturerRepository;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void requestWithoutTokenIsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/collections")).andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedNonTeacherIsForbidden() throws Exception {
        var student = new JwtAuthenticationToken(
                Jwt.withTokenValue("token").header("alg", "ES256").subject(UUID.randomUUID().toString()).build(),
                List.of());

        mockMvc.perform(get("/api/collections").with(authentication(student)))
                .andExpect(status().isForbidden());
    }

    @Test
    void lecturerCanListCollections() throws Exception {
        when(collectionService.listForOwner(LECTURER_ID)).thenReturn(List.of(
                new CollectionResponse(UUID.randomUUID(), "Neuro 101", null, false, Instant.now(), Instant.now())));

        mockMvc.perform(get("/api/collections").with(asLecturer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Neuro 101"));
    }

    @Test
    void malformedIdIsBadRequestNotServerError() throws Exception {
        mockMvc.perform(get("/api/collections/not-a-uuid").with(asLecturer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void unreadableBodyIsBadRequest() throws Exception {
        mockMvc.perform(post("/api/collections").with(asLecturer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void validationErrorsAreReportedPerField() throws Exception {
        mockMvc.perform(post("/api/collections").with(asLecturer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.name").exists());
    }

    @Test
    void publicFlagMayBeOmitted() throws Exception {
        when(collectionService.create(any(), any())).thenReturn(
                new CollectionResponse(UUID.randomUUID(), "Neuro 101", null, false, Instant.now(), Instant.now()));

        mockMvc.perform(post("/api/collections").with(asLecturer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Neuro 101\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void unknownRouteIsNotFound() throws Exception {
        mockMvc.perform(get("/api/does-not-exist").with(asLecturer()))
                .andExpect(status().isNotFound());
    }

    @Test
    void unexpectedErrorIsServerError() throws Exception {
        when(collectionService.listForOwner(any())).thenThrow(new IllegalStateException("boom"));

        mockMvc.perform(get("/api/collections").with(asLecturer()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("An unexpected error occurred"));
    }

    private static RequestPostProcessor asLecturer() {
        var principal = new LecturerPrincipal(LECTURER_ID, "lecturer@example.com");
        return authentication(UsernamePasswordAuthenticationToken.authenticated(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_TEACHER"))));
    }
}
