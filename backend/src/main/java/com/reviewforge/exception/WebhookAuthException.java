package com.reviewforge.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.FORBIDDEN)
public class WebhookAuthException extends ReviewForgeException {
    public WebhookAuthException(String message) { super(message); }
}
