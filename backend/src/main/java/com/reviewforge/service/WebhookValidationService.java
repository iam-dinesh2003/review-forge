package com.reviewforge.service;

import com.reviewforge.config.GitHubAppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.binary.Hex;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Validates GitHub webhook signatures using HMAC-SHA256.
 *
 * GitHub sends: X-Hub-Signature-256: sha256=<hex>
 * We compute our own HMAC and compare using constant-time equality
 * to prevent timing-oracle attacks.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class WebhookValidationService {

    private final GitHubAppProperties props;

    /**
     * @param payload   raw request body bytes as UTF-8 string
     * @param signature value of X-Hub-Signature-256 header ("sha256=abc...")
     * @return true if signature is valid
     */
    public boolean isValid(String payload, String signature) {
        if (signature == null || !signature.startsWith("sha256=")) {
            log.warn("Missing or malformed X-Hub-Signature-256 header");
            return false;
        }

        String secret = props.getWebhookSecret();
        if (secret == null || secret.isBlank()) {
            log.warn("Webhook secret not configured — skipping validation (dev mode)");
            return true;   // allow in dev; in prod this env var must be set
        }

        try {
            String received = signature.substring(7); // strip "sha256="
            String computed = computeHmac(secret, payload);

            // Constant-time comparison to prevent timing oracle
            return MessageDigest.isEqual(
                    computed.getBytes(StandardCharsets.UTF_8),
                    received.getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception e) {
            log.error("HMAC validation error: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Public so it can be used in integration tests and admin tooling.
     */
    public static String computeHmac(String secret, String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        return Hex.encodeHexString(hash);
    }
}
