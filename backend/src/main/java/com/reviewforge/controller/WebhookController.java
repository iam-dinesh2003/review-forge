package com.reviewforge.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.dto.webhook.PullRequestEventPayload;
import com.reviewforge.exception.WebhookAuthException;
import com.reviewforge.service.PullRequestService;
import com.reviewforge.service.WebhookValidationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Receives GitHub App webhook events.
 *
 * GitHub expects a 200 response within 10 seconds — we return immediately
 * after signature validation and dispatch the review work to an @Async thread.
 *
 * Endpoint: POST /webhook
 * Headers validated:
 *   X-GitHub-Event        — event type (we only process "pull_request")
 *   X-Hub-Signature-256   — HMAC-SHA256 of the raw body with the webhook secret
 */
@RestController
@Slf4j
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookValidationService validationService;
    private final PullRequestService pullRequestService;
    private final ObjectMapper objectMapper;

    /**
     * Main webhook entry point.
     *
     * @param rawBody   raw request body as String (critical: must NOT be parsed by Spring
     *                  before we validate the signature — HMAC is computed over the raw bytes)
     * @param event     X-GitHub-Event header value
     * @param signature X-Hub-Signature-256 header value
     */
    @PostMapping("/webhook")
    public ResponseEntity<Map<String, String>> handleWebhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-GitHub-Event", defaultValue = "unknown") String event,
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature
    ) {
        // ── 1. Validate HMAC signature ─────────────────────────────────────────
        if (!validationService.isValid(rawBody, signature)) {
            log.warn("Webhook rejected — invalid or missing signature");
            throw new WebhookAuthException("Invalid webhook signature");
        }

        log.debug("Webhook received: event={} bodyLen={}", event, rawBody.length());

        // ── 2. Only process pull_request events ────────────────────────────────
        if (!"pull_request".equals(event)) {
            log.debug("Ignoring non-PR event: {}", event);
            return ResponseEntity.ok(Map.of("status", "ignored", "event", event));
        }

        // ── 3. Parse payload ───────────────────────────────────────────────────
        PullRequestEventPayload payload;
        try {
            payload = objectMapper.readValue(rawBody, PullRequestEventPayload.class);
        } catch (Exception e) {
            log.error("Failed to parse PR webhook payload: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("status", "parse_error"));
        }

        // ── 4. Only process opened / synchronize actions ───────────────────────
        String action = payload.getAction();
        if (!"opened".equals(action) && !"synchronize".equals(action)) {
            log.debug("Ignoring PR action: {}", action);
            return ResponseEntity.ok(Map.of("status", "ignored", "action", action));
        }

        // ── 5. Dispatch async review (returns before review completes) ─────────
        log.info("Dispatching review: repo={} pr=#{} action={}",
                payload.getRepository().getFullName(),
                payload.getPullRequest().getNumber(),
                action);
        pullRequestService.reviewAsync(payload);

        return ResponseEntity.ok(Map.of("status", "accepted"));
    }
}
