package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"social-network/internal/models"
	pb "social-network/proto/graphranking"
)

// GetGraphTopology возвращает локальную топологию графа связей для интерактивного Canvas-рендерера.
// GET /api/graph/topology
func (h *Handler) GetGraphTopology(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authUser := h.getUserFromRequest(r)
	centerID := 1
	if authUser != nil {
		centerID = authUser.ID
	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil && uid > 0 {
			centerID = uid
		}
	}

	maxNodes := 25
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
			maxNodes = l
		}
	}

	// 1. Попытка вызова gRPC микросервиса
	if h.remoteGraphClient != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
		defer cancel()
		resp, err := h.remoteGraphClient.Client().GetTopology(ctx, &pb.TopologyRequest{
			Depth:         int32(maxNodes),
			CurrentUserId: int64(centerID),
		})
		if err == nil && resp != nil {
			var nodes []map[string]interface{}
			for _, n := range resp.Nodes {
				nodes = append(nodes, map[string]interface{}{
					"id":           n.Id,
					"username":     n.Username,
					"display_name": n.DisplayName,
					"avatar_url":   n.AvatarUrl,
					"affinity":     n.Pagerank,
				})
			}
			var edges []map[string]interface{}
			for _, e := range resp.Edges {
				edges = append(edges, map[string]interface{}{
					"source": e.Source,
					"target": e.Target,
					"weight": e.Weight,
				})
			}
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"center_user_id": centerID,
				"total_nodes":    resp.TotalNodes,
				"total_edges":    resp.TotalEdges,
				"nodes":          nodes,
				"edges":          edges,
				"source":         "grpc_microservice",
			})
			return
		}
	}

	// 2. Локальный fallback
	if h.socialGraph == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"nodes": []interface{}{},
			"edges": []interface{}{},
		})
		return
	}

	nodes, edges := h.socialGraph.GetEgoGraph(centerID, maxNodes)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"center_user_id": centerID,
		"total_nodes":    len(nodes),
		"total_edges":    len(edges),
		"nodes":          nodes,
		"edges":          edges,
		"source":         "in_process_fallback",
	})
}

// GetShortestPath вычисляет кратчайший путь и степени разделения (рукопожатий) между пользователями.
// GET /api/graph/path/{targetUserId}
func (h *Handler) GetShortestPath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authUser := h.getUserFromRequest(r)
	sourceID := 1
	if authUser != nil {
		sourceID = authUser.ID
	} else if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if fID, err := strconv.Atoi(fromStr); err == nil && fID > 0 {
			sourceID = fID
		}
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL path"})
		return
	}
	targetID, err := strconv.Atoi(parts[3])
	if err != nil || targetID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid target user ID"})
		return
	}

	// 1. Попытка вызова gRPC микросервиса
	if h.remoteGraphClient != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
		defer cancel()
		resp, err := h.remoteGraphClient.Client().GetShortestPath(ctx, &pb.PathRequest{
			FromUserId: int64(sourceID),
			ToUserId:   int64(targetID),
		})
		if err == nil && resp != nil {
			var pathNames []string
			var pathUsernames []string
			for _, step := range resp.Path {
				pathNames = append(pathNames, step.DisplayName)
				pathUsernames = append(pathUsernames, "@"+step.Username)
			}
			deg := int(resp.Distance)
			pathDesc := "Связь не обнаружена"
			if deg == 0 {
				pathDesc = "Это ваш собственный профиль (0 рукопожатий)"
			} else if deg == 1 {
				pathDesc = "Прямой контакт: вы связаны напрямую (1-е рукопожатие)"
			} else if deg == 2 && len(pathNames) > 1 {
				pathDesc = fmt.Sprintf("Общий знакомый: связь через %s (2-е рукопожатие)", pathNames[1])
			} else if deg > 2 {
				pathDesc = fmt.Sprintf("Цепочка связей через %d посредников (%d рукопожатий): %s", deg-1, deg, strings.Join(pathNames, " ➔ "))
			}
			respondJSON(w, http.StatusOK, models.DegreesOfSeparationResponse{
				SourceUserID:    sourceID,
				TargetUserID:    targetID,
				Degree:          deg,
				PathUsernames:   pathUsernames,
				PathNames:       pathNames,
				PathDescription: pathDesc,
			})
			return
		}
	}

	// 2. Локальный fallback
	if h.socialGraph == nil {
		respondJSON(w, http.StatusOK, models.DegreesOfSeparationResponse{
			SourceUserID:    sourceID,
			TargetUserID:    targetID,
			Degree:          -1,
			PathDescription: "Граф недоступен",
		})
		return
	}

	deg, pathIDs := h.socialGraph.FindShortestPath(sourceID, targetID)

	var pathNames []string
	var pathUsernames []string
	for _, id := range pathIDs {
		if n, ok := h.socialGraph.GetNode(id); ok {
			pathNames = append(pathNames, n.DisplayName)
			pathUsernames = append(pathUsernames, "@"+n.Username)
		} else {
			pathNames = append(pathNames, fmt.Sprintf("User #%d", id))
			pathUsernames = append(pathUsernames, fmt.Sprintf("@user%d", id))
		}
	}

	pathDesc := "Связь не обнаружена"
	if deg == 0 {
		pathDesc = "Это ваш собственный профиль (0 рукопожатий)"
	} else if deg == 1 {
		pathDesc = "Прямой контакт: вы связаны напрямую (1-е рукопожатие)"
	} else if deg == 2 && len(pathNames) > 1 {
		pathDesc = fmt.Sprintf("Общий знакомый: связь через %s (2-е рукопожатие)", pathNames[1])
	} else if deg > 2 {
		pathDesc = fmt.Sprintf("Цепочка связей через %d посредников (%d рукопожатий): %s", deg-1, deg, strings.Join(pathNames, " ➔ "))
	}

	respondJSON(w, http.StatusOK, models.DegreesOfSeparationResponse{
		SourceUserID:    sourceID,
		TargetUserID:    targetID,
		Degree:          deg,
		PathUsernames:   pathUsernames,
		PathNames:       pathNames,
		PathDescription: pathDesc,
	})
}

// GetGraphRecommendations возвращает рекомендации кандидатов для знакомства по индексу Адамика-Адара.
// GET /api/graph/recommendations
func (h *Handler) GetGraphRecommendations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authUser := h.getUserFromRequest(r)
	sourceID := 1
	if authUser != nil {
		sourceID = authUser.ID
	}

	limit := 6
	if limStr := r.URL.Query().Get("limit"); limStr != "" {
		if l, err := strconv.Atoi(limStr); err == nil && l > 0 && l <= 20 {
			limit = l
		}
	}

	// 1. Попытка вызова gRPC микросервиса
	if h.remoteGraphClient != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
		defer cancel()
		resp, err := h.remoteGraphClient.Client().GetRecommendations(ctx, &pb.RecommendationRequest{
			UserId: int64(sourceID),
			Limit:  int32(limit),
		})
		if err == nil && resp != nil {
			var recs []map[string]interface{}
			for _, item := range resp.Recommendations {
				recs = append(recs, map[string]interface{}{
					"user": map[string]interface{}{
						"id":           item.UserId,
						"username":     item.Username,
						"display_name": item.DisplayName,
						"avatar_url":   item.AvatarUrl,
					},
					"score":        item.Score,
					"mutual_count": item.MutualFriendsCount,
				})
			}
			respondJSON(w, http.StatusOK, recs)
			return
		}
	}

	// 2. Локальный fallback
	if h.socialGraph == nil {
		respondJSON(w, http.StatusOK, []interface{}{})
		return
	}

	recs := h.socialGraph.GetRecommendations(sourceID, limit)
	respondJSON(w, http.StatusOK, recs)
}
