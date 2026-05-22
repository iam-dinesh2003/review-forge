package com.reviewforge;

import com.reviewforge.config.GitHubAppProperties;
import com.reviewforge.service.WebhookValidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit tests for WebhookValidationService — no Spring context required.
 *
 * We manually wire the service with controlled GitHubAppProperties so these
 * tests run in milliseconds and need no DB / Redis / Gemini credentials.
 */
class ReviewForgeApplicationTests {

    private WebhookValidationService serviceWithSecret;
    private WebhookValidationService serviceWithNoSecret;

    @BeforeEach
    void setUp() {
        GitHubAppProperties propsWithSecret = new GitHubAppProperties();
        propsWithSecret.setWebhookSecret("test-secret-key");

        GitHubAppProperties propsNoSecret = new GitHubAppProperties();
        propsNoSecret.setWebhookSecret(""); // blank = dev mode

        serviceWithSecret  = new WebhookValidationService(propsWithSecret);
        serviceWithNoSecret = new WebhookValidationService(propsNoSecret);
    }

    // ── HMAC validation ────────────────────────────────────────────────────

    @Test
    void correctSignature_returnsTrue() throws Exception {
        String payload   = "{\"action\":\"opened\"}";
        String computed  = WebhookValidationService.computeHmac("test-secret-key", payload);
        String signature = "sha256=" + computed;

        assertThat(serviceWithSecret.isValid(payload, signature)).isTrue();
    }

    @Test
    void wrongSignature_returnsFalse() {
        assertThat(serviceWithSecret.isValid("{\"action\":\"opened\"}", "sha256=deadbeef")).isFalse();
    }

    @Test
    void missingSignature_returnsFalse() {
        assertThat(serviceWithSecret.isValid("payload", null)).isFalse();
    }

    @Test
    void malformedSignature_missingPrefix_returnsFalse() {
        assertThat(serviceWithSecret.isValid("payload", "not-a-signature")).isFalse();
    }

    @Test
    void emptySecret_devMode_allowsAnySignature() {
        // When webhook secret is blank (dev mode), validation is bypassed
        assertThat(serviceWithNoSecret.isValid("payload", "sha256=whatever")).isTrue();
    }

    @Test
    void hmacCompute_isDeterministic() throws Exception {
        String a = WebhookValidationService.computeHmac("key", "msg");
        String b = WebhookValidationService.computeHmac("key", "msg");
        assertThat(a).isEqualTo(b);
    }

    @Test
    void hmacCompute_differentInputs_produceDifferentHashes() throws Exception {
        String a = WebhookValidationService.computeHmac("key", "msg1");
        String b = WebhookValidationService.computeHmac("key", "msg2");
        assertThat(a).isNotEqualTo(b);
    }
}
