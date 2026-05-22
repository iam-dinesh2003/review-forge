package com.reviewforge.dto.candidate;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.entity.BatchJob;
import lombok.Builder;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
@Builder
public class BatchJobDTO {

    private String id;
    private String name;
    private int totalCandidates;
    private int processed;
    private int failedCount;
    private String status;
    private String createdAt;
    private String completedAt;
    private List<String> candidateIds;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static BatchJobDTO from(BatchJob e) {
        return BatchJobDTO.builder()
                .id(String.valueOf(e.getId()))
                .name(e.getName())
                .totalCandidates(e.getTotalCandidates())
                .processed(e.getProcessed())
                .failedCount(e.getFailedCount())
                .status(e.getStatus())
                .createdAt(e.getCreatedAt() != null ? e.getCreatedAt().toString() : null)
                .completedAt(e.getCompletedAt() != null ? e.getCompletedAt().toString() : null)
                .candidateIds(parseList(e.getCandidateIdsJson()))
                .build();
    }

    private static List<String> parseList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return MAPPER.readValue(json, new TypeReference<>() {}); }
        catch (Exception e) { return Collections.emptyList(); }
    }
}
