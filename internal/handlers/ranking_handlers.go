package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/models"
)

// GetRankedFeed возвращает персонализированную умную ленту с многофакторным скорингом.
// GET /api/feed/ranked?limit=20&offset=0&feed_type=all
func (h *Handler) GetRankedFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authUser := h.getUserFromRequest(r)
	currentUserID := 0
	if authUser != nil {
		currentUserID = authUser.ID
	}

	feedType := r.URL.Query().Get("feed_type")
	if feedType == "" {
		feedType = "all"
	}
	searchQuery := strings.TrimSpace(r.URL.Query().Get("q"))
	tagQuery := strings.TrimSpace(r.URL.Query().Get("tag"))

	limit := 20
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}
	offset := 0
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	// Запрашиваем выборку кандидатов из БД
	candidatePoolLimit := limit * 2
	if candidatePoolLimit < 30 {
		candidatePoolLimit = 30
	}
	posts, err := h.postRepo.GetFeed(currentUserID, feedType, searchQuery, tagQuery, candidatePoolLimit, offset)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if h.rankingEngine == nil || len(posts) == 0 {
		respondJSON(w, http.StatusOK, posts)
		return
	}

	// Тематические интересы пользователя
	preferredTags := []string{"cyberpunk", "go", "music", "neon", "identityv", "nightcity"}
	if authUser != nil && authUser.Bio != "" {
		words := strings.Fields(strings.ToLower(authUser.Bio))
		preferredTags = append(preferredTags, words...)
	}

	rankedPosts := h.rankingEngine.RankFeed(currentUserID, posts, preferredTags)
	if len(rankedPosts) > limit {
		rankedPosts = rankedPosts[:limit]
	}

	respondJSON(w, http.StatusOK, rankedPosts)
}

// ExplainRanking возвращает подробный математический разбор скоринга для конкретной публикации.
// GET /api/feed/ranked/explain/{postId}
func (h *Handler) ExplainRanking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL path"})
		return
	}
	postID, err := strconv.Atoi(parts[4])
	if err != nil || postID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid post ID"})
		return
	}

	authUser := h.getUserFromRequest(r)
	currentUserID := 0
	if authUser != nil {
		currentUserID = authUser.ID
	}

	post, err := h.postRepo.GetPostByID(postID, currentUserID)
	if err != nil || post == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Post not found"})
		return
	}

	if h.rankingEngine != nil {
		rankedSlice := h.rankingEngine.RankFeed(currentUserID, []models.Post{*post}, nil)
		if len(rankedSlice) > 0 {
			post = &rankedSlice[0]
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"post_id":         post.ID,
		"author_id":       post.UserID,
		"author_username": post.User.Username,
		"ranking_score":   post.RankingScore,
		"ranking_factors": post.RankingFactors,
	})
}
