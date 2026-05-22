package com.reviewforge.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Central error handler for the ReviewForge REST API.
 *
 * Returns consistent JSON error envelopes:
 * {
 *   "status": 403,
 *   "error": "Forbidden",
 *   "message": "Invalid webhook signature",
 *   "timestamp": "2025-05-12T10:30:00"
 * }
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // ── Webhook auth ───────────────────────────────────────────────────────────

    @ExceptionHandler(WebhookAuthException.class)
    public ResponseEntity<Map<String, Object>> handleWebhookAuth(WebhookAuthException ex) {
        log.warn("Webhook auth failure: {}", ex.getMessage());
        return error(HttpStatus.FORBIDDEN, "Forbidden", ex.getMessage());
    }

    // ── ReviewForge domain errors ──────────────────────────────────────────────

    @ExceptionHandler(ReviewForgeException.class)
    public ResponseEntity<Map<String, Object>> handleReviewForge(ReviewForgeException ex) {
        log.error("ReviewForge error: {}", ex.getMessage(), ex.getCause());
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", ex.getMessage());
    }

    // ── Spring MVC input errors ────────────────────────────────────────────────

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, Object>> handleMissingHeader(MissingRequestHeaderException ex) {
        return error(HttpStatus.BAD_REQUEST, "Bad Request", "Missing required header: " + ex.getHeaderName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return error(HttpStatus.BAD_REQUEST, "Bad Request",
                "Invalid value for parameter '" + ex.getName() + "': " + ex.getValue());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Illegal argument: {}", ex.getMessage());
        return error(HttpStatus.BAD_REQUEST, "Bad Request", ex.getMessage());
    }

    // ── Catch-all ──────────────────────────────────────────────────────────────

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        log.error("Unhandled exception: {}", ex.getMessage(), ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error",
                "An unexpected error occurred. Please try again.");
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String error, String message) {
        return ResponseEntity.status(status).body(Map.of(
                "status", status.value(),
                "error", error,
                "message", message != null ? message : "",
                "timestamp", LocalDateTime.now().toString()
        ));
    }
}
