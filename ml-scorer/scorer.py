"""
ML-based JD matching microservice.
Replaces Gemini per-candidate calls with TF-IDF + cosine similarity scored globally.
"""
import re
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------------------
# Skills vocabulary
# ---------------------------------------------------------------------------
PROGRAMMING_LANGUAGES = {
    "java", "python", "javascript", "typescript", "go", "golang", "rust", "kotlin",
    "scala", "swift", "c++", "c#", "ruby", "php", "r", "matlab", "dart", "elixir",
    "haskell", "erlang", "clojure", "groovy", "perl", "bash", "shell", "powershell",
}
FRAMEWORKS_AND_TOOLS = {
    "spring", "spring-boot", "springboot", "django", "flask", "fastapi", "express",
    "nestjs", "rails", "laravel", "react", "angular", "vue", "nextjs", "nuxtjs",
    "svelte", "hibernate", "jpa", "mybatis", "kafka", "rabbitmq", "activemq",
    "kubernetes", "docker", "terraform", "ansible", "jenkins", "github-actions",
    "gradle", "maven", "webpack", "vite", "graphql", "grpc", "rest", "soap",
    "junit", "testng", "pytest", "jest", "cypress", "selenium", "mockito",
    "prometheus", "grafana", "elk", "splunk", "datadog", "opentelemetry",
}
DATABASES = {
    "postgresql", "postgres", "mysql", "mariadb", "oracle", "mssql",
    "mongodb", "cassandra", "dynamodb", "couchdb", "redis", "memcached",
    "elasticsearch", "opensearch", "neo4j", "influxdb", "sqlite", "h2",
}
CLOUD = {
    "aws", "gcp", "azure", "ec2", "s3", "rds", "lambda", "ecs", "eks",
    "cloudformation", "cdk", "gke", "cloud-run", "bigquery", "pubsub",
    "heroku", "vercel", "netlify", "cloudflare",
}
CONCEPTS = {
    "microservices", "event-driven", "cqrs", "saga", "ddd", "tdd", "bdd",
    "ci/cd", "devops", "agile", "scrum", "solid", "design-patterns",
    "distributed-systems", "load-balancing", "caching", "sharding",
    "api-gateway", "service-mesh", "oauth", "jwt", "openid", "saml",
}

ALL_SKILLS = (
    PROGRAMMING_LANGUAGES | FRAMEWORKS_AND_TOOLS |
    DATABASES | CLOUD | CONCEPTS
)

SKILL_ALIASES = {
    "k8s": "kubernetes", "pg": "postgresql", "ts": "typescript",
    "js": "javascript", "node": "nodejs", "node.js": "nodejs",
    "react.js": "react", "vue.js": "vue", "next.js": "nextjs",
    "spring boot": "spring-boot", "gke": "kubernetes",
    "postgres": "postgresql", "mongo": "mongodb",
    "rabbit": "rabbitmq", "elastic": "elasticsearch",
}


def _normalize(text: str) -> str:
    text = text.lower()
    for alias, canonical in SKILL_ALIASES.items():
        text = re.sub(rf"\b{re.escape(alias)}\b", canonical, text)
    return text


def _extract_skills(text: str) -> set[str]:
    norm = _normalize(text)
    found = set()
    for skill in ALL_SKILLS:
        pattern = rf"\b{re.escape(skill)}\b"
        if re.search(pattern, norm):
            found.add(skill)
    return found


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class SkillSignal(BaseModel):
    name: str
    level: Optional[str] = None  # EXPERT / PROFICIENT / FAMILIAR


class LanguageShare(BaseModel):
    name: str
    percentage: float


class CandidateInput(BaseModel):
    username: str
    bio: Optional[str] = ""
    skills: list[SkillSignal] = []
    languages: list[LanguageShare] = []
    activity_score: Optional[float] = 0.5   # 0–1, contribution activity
    repo_quality: Optional[float] = 0.5     # 0–1, stars/forks quality


class ScoreRequest(BaseModel):
    jd_text: str
    candidates: list[CandidateInput]


class CandidateScore(BaseModel):
    username: str
    score: float
    verdict: str
    matched_skills: list[str]
    missing_skills: list[str]
    tfidf_similarity: float
    skill_overlap_pct: float
    summary: str


class ScoreResponse(BaseModel):
    results: list[CandidateScore]
    required_skills: list[str]


# ---------------------------------------------------------------------------
# Scoring logic
# ---------------------------------------------------------------------------
def _build_candidate_text(c: CandidateInput) -> str:
    parts = []
    if c.bio:
        parts.append(c.bio)
    for s in c.skills:
        weight = 3 if s.level == "EXPERT" else 2 if s.level == "PROFICIENT" else 1
        parts.extend([s.name.lower()] * weight)
    for lang in c.languages:
        count = max(1, int(lang.percentage / 10))
        parts.extend([lang.name.lower()] * count)
    return " ".join(parts)


def _verdict(score: float) -> str:
    if score >= 70:
        return "STRONG_FIT"
    if score >= 40:
        return "MAYBE"
    return "POOR_FIT"


def _summary(verdict: str, matched: list[str], missing: list[str]) -> str:
    if verdict == "STRONG_FIT":
        return f"Strong match. Has {', '.join(matched[:3]) or 'most required skills'}."
    if verdict == "MAYBE":
        miss = ", ".join(missing[:3])
        return f"Partial match. Missing: {miss}." if miss else "Partial match."
    miss = ", ".join(missing[:4])
    return f"Weak match. Missing: {miss}." if miss else "Skills do not align with the JD."


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    jd_norm = _normalize(req.jd_text)
    required_skills = _extract_skills(jd_norm)

    candidate_texts = [_build_candidate_text(c) for c in req.candidates]

    # TF-IDF fit on full corpus (all candidates + JD) — global vocabulary
    corpus = candidate_texts + [jd_norm]
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=1,
        max_features=5000,
        sublinear_tf=True,
        stop_words="english",
    )
    tfidf_matrix = vectorizer.fit_transform(corpus)
    jd_vec = tfidf_matrix[-1]
    candidate_vecs = tfidf_matrix[:-1]

    if candidate_vecs.shape[0] > 0:
        similarities = cosine_similarity(candidate_vecs, jd_vec).flatten()
    else:
        similarities = np.array([])

    results: list[CandidateScore] = []
    for i, c in enumerate(req.candidates):
        candidate_skills = set()
        for s in c.skills:
            candidate_skills.add(s.name.lower())
        for lang in c.languages:
            candidate_skills.add(lang.name.lower())
        # also scan bio text
        candidate_skills |= _extract_skills(c.bio or "")

        if required_skills:
            matched = sorted(required_skills & candidate_skills)
            missing = sorted(required_skills - candidate_skills)
            skill_overlap = len(matched) / len(required_skills)
        else:
            matched, missing, skill_overlap = [], [], 0.5

        tfidf_sim = float(similarities[i]) if i < len(similarities) else 0.0

        # Combined score: skill overlap weighted heavier (direct match)
        raw = skill_overlap * 0.60 + tfidf_sim * 0.40
        score_val = round(min(raw * 100, 100), 1)

        verdict = _verdict(score_val)
        results.append(CandidateScore(
            username=c.username,
            score=score_val,
            verdict=verdict,
            matched_skills=matched,
            missing_skills=missing,
            tfidf_similarity=round(tfidf_sim, 4),
            skill_overlap_pct=round(skill_overlap * 100, 1),
            summary=_summary(verdict, matched, missing),
        ))

    # Global sort — single ranking across all candidates
    results.sort(key=lambda r: r.score, reverse=True)
    return ScoreResponse(results=results, required_skills=sorted(required_skills))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("scorer:app", host="0.0.0.0", port=8091, reload=True)
