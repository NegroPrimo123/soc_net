package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/models"
)

// CreateCollection создает новую тематическую подборку постов.
func (h *Handler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	var req models.CreateCollectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "название подборки обязательно"})
		return
	}

	col, err := h.collectionRepo.CreateCollection(currentUser.ID, &req)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	col.User = currentUser

	respondJSON(w, http.StatusCreated, col)
}

// GetCollections возвращает подборки текущего пользователя.
func (h *Handler) GetCollections(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	collections, err := h.collectionRepo.GetUserCollections(currentUser.ID, currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, collections)
}

// GetUserCollections возвращает публичные подборки указанного пользователя.
func (h *Handler) GetUserCollections(w http.ResponseWriter, r *http.Request) {
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
	targetID, err := strconv.Atoi(idStr)
	if err != nil || targetID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID пользователя"})
		return
	}

	collections, err := h.collectionRepo.GetUserCollections(targetID, viewerID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, collections)
}

// GetCollection возвращает детальное содержимое подборки со всеми сохраненными постами.
func (h *Handler) GetCollection(w http.ResponseWriter, r *http.Request) {
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
	colID, err := strconv.Atoi(idStr)
	if err != nil || colID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID коллекции"})
		return
	}

	detail, err := h.collectionRepo.GetCollectionByID(colID, viewerID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, detail)
}

// UpdateCollection обновляет название, описание и приватность подборки.
func (h *Handler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
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
	colID, err := strconv.Atoi(idStr)
	if err != nil || colID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID коллекции"})
		return
	}

	var req models.UpdateCollectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	if err := h.collectionRepo.UpdateCollection(colID, currentUser.ID, &req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// DeleteCollection удаляет подборку.
func (h *Handler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
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
	colID, err := strconv.Atoi(idStr)
	if err != nil || colID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID коллекции"})
		return
	}

	if err := h.collectionRepo.DeleteCollection(colID, currentUser.ID); err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// AddPostToCollection добавляет пост в коллекцию.
func (h *Handler) AddPostToCollection(w http.ResponseWriter, r *http.Request) {
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
	colID, err := strconv.Atoi(idStr)
	if err != nil || colID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID коллекции"})
		return
	}

	var req models.AddPostToCollectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	if req.PostID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID поста"})
		return
	}

	if err := h.collectionRepo.AddPostToCollection(colID, req.PostID, currentUser.ID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"status":        "added",
		"collection_id": colID,
		"post_id":       req.PostID,
	})
}

// RemovePostFromCollection удаляет пост из коллекции.
func (h *Handler) RemovePostFromCollection(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	idStr := r.PathValue("id")
	postIdStr := r.PathValue("postId")
	if idStr == "" || postIdStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 5 {
			idStr = parts[2]
			postIdStr = parts[4]
		}
	}

	colID, err := strconv.Atoi(idStr)
	postID, err2 := strconv.Atoi(postIdStr)
	if err != nil || err2 != nil || colID <= 0 || postID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверные параметры"})
		return
	}

	if err := h.collectionRepo.RemovePostFromCollection(colID, postID, currentUser.ID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"status":        "removed",
		"collection_id": colID,
		"post_id":       postID,
	})
}

// GetPostCollectionsStatus возвращает статус сохранения поста во всех подборках текущего пользователя.
func (h *Handler) GetPostCollectionsStatus(w http.ResponseWriter, r *http.Request) {
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
	postID, err := strconv.Atoi(idStr)
	if err != nil || postID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID поста"})
		return
	}

	collections, err := h.collectionRepo.GetPostCollectionsStatus(postID, currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, collections)
}
