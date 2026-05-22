package com.reviewforge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
@EnableConfigurationProperties
public class ReviewForgeApplication {

    public static void main(String[] args) {
        SpringApplication.run(ReviewForgeApplication.class, args);
    }
}
