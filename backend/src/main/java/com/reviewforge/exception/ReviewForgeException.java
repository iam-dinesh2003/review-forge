package com.reviewforge.exception;

public class ReviewForgeException extends RuntimeException {
    public ReviewForgeException(String message) { super(message); }
    public ReviewForgeException(String message, Throwable cause) { super(message, cause); }
}
