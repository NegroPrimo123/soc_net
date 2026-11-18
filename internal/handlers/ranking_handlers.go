package handlers

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"social-network/internal/models"
	pb "social-network/proto/graphranking"
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

	if len(posts) == 0 {
		respondJSON(w, http.StatusOK, posts)
		return
	}

	// 1. Попытка вызова gRPC микросервиса ранжирования
	if h.remoteGraphClient != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
		defer cancel()

		var candidates []*pb.PostCandidate
		for _, p := range posts {
			candidates = append(candidates, &pb.PostCandidate{
				Id:            int64(p.ID),
				UserId:        int64(p.UserID),
				Content:       p.Content,
				CreatedAtUnix: p.CreatedAt.Unix(),
				LikesCount:    int32(p.LikesCount),
				CommentsCount: int32(p.CommentsCount),
			})
		}

		resp, err := h.remoteGraphClient.Client().RankFeed(ctx, &pb.RankFeedRequest{
			CurrentUserId: int64(currentUserID),
			Limit:         int32(limit),
			Offset:        int32(offset),
			Candidates:    candidates,
		})

		if err == nil && resp != nil && len(resp.RankedPosts) > 0 {
			type rScore struct {
				score   float64
				factors models.RankingFactors
			}
			scoreMap := make(map[int]rScore)
			for _, rp := range resp.RankedPosts {
				scoreMap[int(rp.Id)] = rScore{
					score: rp.FinalScore,
					factors: models.RankingFactors{
						FinalScore:       rp.FinalScore,
						GraphAffinity:    rp.AffinityScore,
						FreshnessScore:   rp.FreshnessScore,
						EngagementScore:  rp.EngagementScore,
						TopicMatchScore:  rp.TopicScore,
						DiversityPenalty: rp.DiversityPenalty,
					},
				}
			}

			for i := range posts {
				if sc, ok := scoreMap[posts[i].ID]; ok {
					posts[i].RankingScore = sc.score
					fCopy := sc.factors
					posts[i].RankingFactors = &fCopy
				}
			}

			sort.Slice(posts, func(i, j int) bool {
				return posts[i].RankingScore > posts[j].RankingScore
			})

			if len(posts) > limit {
				posts = posts[:limit]
			}

			respondJSON(w, http.StatusOK, posts)
			return
		}
	}

	// 2. Локальный fallback
	if h.rankingEngine == nil {
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
