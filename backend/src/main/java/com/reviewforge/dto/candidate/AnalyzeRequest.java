package com.reviewforge.dto.candidate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AnalyzeRequest {

    @NotBlank
    @Size(min = 1, max = 39)
    @Pattern(regexp = "^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$",
             message = "Must be a valid GitHub username")
    private String githubLogin;
}
