package com.neurogames;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

// Boots the full app, which connects to the real Supabase database and JWKS
// endpoint, so it only runs when those are configured (export the variables
// from .env.example). The rest of the suite needs no external services.
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "SUPABASE_DB_HOST", matches = ".+")
@EnabledIfEnvironmentVariable(named = "SUPABASE_URL", matches = ".+")
class NeurogamesBackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
