package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/events"
	"social-network/internal/models"
)

// CreateStory создает новую 24-часовую временную историю.
func (h *Handler) CreateStory(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	var req models.CreateStoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	req.MediaURL = strings.TrimSpace(req.MediaURL)
	req.Caption = strings.TrimSpace(req.Caption)
	if req.MediaURL == "" && req.Caption == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "история должна содержать фото или текстовую запись"})
		return
	}

	story, err := h.storyRepo.CreateStory(currentUser.ID, &req)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Рассылка SSE-события создания истории
	if h.hub != nil {
		h.hub.Broadcast(events.EventNotification, map[string]interface{}{
			"action_type": "new_story",
			"actor":       currentUser,
			"title":       "Новая история",
			"content":     currentUser.DisplayName + " опубликовал(а) новую историю",
		})
	}

	respondJSON(w, http.StatusCreated, story)
}

// GetStories возвращает список активных историй, сгруппированных по авторам.
func (h *Handler) GetStories(w http.ResponseWriter, r *http.Request) {
	viewerID := 0
	if currentUser := h.getUserFromRequest(r); currentUser != nil {
		viewerID = currentUser.ID
	}

	groups, err := h.storyRepo.GetActiveStories(viewerID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, groups)
}

// GetStory возвращает конкретную историю.
func (h *Handler) GetStory(w http.ResponseWriter, r *http.Request) {
	viewerID := 0
	if currentUser := h.getUserFromRequest(r); currentUser != nil {
		viewerID = currentUser.ID
	}

	idStr := r.PathValue("id")
	if idStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			idStr = parts[2]
		}
	}
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID истории"})
		return
	}

	story, err := h.storyRepo.GetStoryByID(id, viewerID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "история не найдена или истекла"})
		return
	}

	respondJSON(w, http.StatusOK, story)
}

// ViewStory отмечает историю просмотренной.
func (h *Handler) ViewStory(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	idStr := r.PathValue("id")
	if idStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			idStr = parts[2]
		}
	}
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID истории"})
		return
	}

	if err := h.storyRepo.MarkStoryViewed(id, currentUser.ID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// DeleteStory удаляет историю автора.
func (h *Handler) DeleteStory(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	idStr := r.PathValue("id")
	if idStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			idStr = parts[2]
		}
	}
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID истории"})
		return
	}

	if err := h.storyRepo.DeleteStory(id, currentUser.ID); err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
