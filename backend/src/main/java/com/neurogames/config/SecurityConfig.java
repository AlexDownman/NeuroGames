package com.neurogames.config;

import com.neurogames.auth.LecturerAuthenticationConverter;
import jakarta.servlet.DispatcherType;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Lecturer credentials are owned entirely by Supabase Auth. This backend
 * never checks a password — it only verifies a Supabase-issued JWT against
 * the project's JWKS (spring.security.oauth2 in application.yml), then
 * LecturerAuthenticationConverter grants ROLE_TEACHER if the "sub" claim is a
 * lecturer. The API is teacher-only: no/invalid token -> 401, valid token
 * without the role (e.g. a student's anonymous sign-in) -> 403.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, LecturerAuthenticationConverter lecturerAuthenticationConverter) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // A failure while authenticating (e.g. the lecturer lookup can't reach
                        // the database) is forwarded to /error with no Authentication; without
                        // this it would be re-reported as 401/403 instead of the real 500.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers("/api/**").hasRole(LecturerAuthenticationConverter.TEACHER_ROLE)
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(lecturerAuthenticationConverter)));

        return http.build();
    }

    // Needed even when the frontend shares the backend's domain (Vercel): browsers
    // send Origin on every POST/PATCH/DELETE, and behind Vercel's proxy Spring sees
    // its own internal host, so it can't tell the request is same-origin.
    @Value("${app.cors.allowed-origin-patterns}")
    private List<String> allowedOriginPatterns;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(allowedOriginPatterns);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
