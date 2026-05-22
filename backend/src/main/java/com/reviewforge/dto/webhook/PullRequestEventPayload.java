package com.reviewforge.dto.webhook;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * Deserialized GitHub pull_request webhook payload.
 * Only fields we actually use — Jackson ignores the rest.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class PullRequestEventPayload {

    private String action;           // "opened" | "synchronize" | "reopened" | "closed"

    @JsonProperty("pull_request")
    private PullRequest pullRequest;

    private Repository repository;

    private Installation installation;

    // ── Nested types ──────────────────────────────────────────────────────────

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PullRequest {
        private Integer number;
        private String title;
        private String state;

        @JsonProperty("html_url")
        private String htmlUrl;

        private Head head;
        private User user;

        @Data
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Head {
            private String sha;
            private String ref;         // branch name
        }

        @Data
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class User {
            private String login;

            @JsonProperty("avatar_url")
            private String avatarUrl;
        }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Repository {
        @JsonProperty("full_name")
        private String fullName;        // "owner/repo"

        private String name;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Installation {
        private Long id;
    }
}
