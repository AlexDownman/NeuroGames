package com.neurogames;

import com.neurogames.config.DotenvLoader;
import com.neurogames.config.JwtProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

// UserDetailsServiceAutoConfiguration is excluded: it exists to generate a
// throwaway in-memory login when Spring Security is on the classpath and no
// UserDetailsService bean is defined. We never define one on purpose —
// JwtAuthenticationFilter builds the Authentication directly from a verified
// Supabase JWT — so this auto-config has nothing useful to do here.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableConfigurationProperties(JwtProperties.class)
public class NeurogamesBackendApplication {

	public static void main(String[] args) {
		DotenvLoader.loadIfPresent();
		SpringApplication.run(NeurogamesBackendApplication.class, args);
	}

}
