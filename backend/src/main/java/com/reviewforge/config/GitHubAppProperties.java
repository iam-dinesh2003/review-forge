package com.reviewforge.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "github.app")
@Getter
@Setter
public class GitHubAppProperties {

    /** GitHub App ID (numeric, shown in App settings) */
    private long id;

    /**
     * RSA private key in PEM format.
     * On Railway: set GITHUB_APP_PRIVATE_KEY env var with full PEM value,
     * using literal \n for newlines. Spring Boot replaces \n at binding time.
     */
    private String privateKey;

    /** HMAC-SHA256 webhook secret configured in GitHub App settings */
    private String webhookSecret;
}
