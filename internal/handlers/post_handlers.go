package handlers

import (
	"encoding/json"

	"fmt"

	"net/http"

	"strconv"

	"strings"

	"social-network/internal/events"

	"social-network/internal/models"
)

func (h *Handler) GetFeed(w http.ResponseWriter, r *http.Request) {

	currentUser := h.getUserFromRequest(r)

	currentUserID := 1

	if currentUser != nil {

		currentUserID = currentUser.ID

	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {

		if uid, err := strconv.Atoi(uidStr); err == nil {

			currentUserID = uid

		}

	}

	feedType := r.URL.Query().Get("feed_type")

	if feedType == "" {

		feedType = "all"

	}

	searchQuery := strings.TrimSpace(r.URL.Query().Get("q"))

	tagQuery := strings.TrimSpace(r.URL.Query().Get("tag"))

	limit := 10

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {

		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {

			limit = l

		}

	}

	offset := 0

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {

		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {

			offset = o

		}

	} else if pageStr := r.URL.Query().Get("page"); pageStr != "" {

		if p, err := strconv.Atoi(pageStr); err == nil && p > 1 {

			offset = (p - 1) * limit

		}

	}

	posts, err := h.postRepo.GetFeed(currentUserID, feedType, searchQuery, tagQuery, limit, offset)

	if err != nil {

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})

		return

	}

	if posts == nil {

		posts = []models.Post{}

	}

	respondJSON(w, http.StatusOK, posts)

}

func (h *Handler) CreatePost(w http.ResponseWriter, r *http.Request) {

	authUser := h.getUserFromRequest(r)

	if authUser == nil {

		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})

		return

	}

	var req models.CreatePostRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})

		return

	}

	req.Content = strings.TrimSpace(req.Content)

	if req.Content == "" && req.ImageURL == "" && req.MusicURL == "" {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "публикация не может быть пустой"})

		return

	}

	req.ImageURL = strings.TrimSpace(req.ImageURL)

	post, err := h.postRepo.CreatePost(authUser.ID, req.Content, req.ImageURL, req.MusicURL, req.MusicTitle, req.MusicArtist)

	if err != nil {

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})

		return

	}

	// Рассылка real-time события всем подключенным клиентам через SSE

	if h.hub != nil {

		h.hub.Broadcast(events.EventNewPost, post)

	}

	respondJSON(w, http.StatusCreated, post)

}

func (h *Handler) UpdatePost(w http.ResponseWriter, r *http.Request) {

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) < 3 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный путь"})

		return

	}

	postID, err := strconv.Atoi(pathParts[2])

	if err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный post id"})

		return

	}

	authUser := h.getUserFromRequest(r)

	if authUser == nil {

		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})

		return

	}

	var req models.UpdatePostRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})

		return

	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" && (req.ImageURL == nil || strings.TrimSpace(*req.ImageURL) == "") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "текст или фото не могут быть пустыми"})
		return
	}

	post, err := h.postRepo.UpdatePost(postID, authUser.ID, req.Content, req.ImageURL, req.MusicURL, req.MusicTitle, req.MusicArtist)

	if err != nil {

		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})

		return

	}

	respondJSON(w, http.StatusOK, post)

}

func (h *Handler) DeletePost(w http.ResponseWriter, r *http.Request) {

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) < 3 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный путь"})

		return

	}

	postID, err := strconv.Atoi(pathParts[2])

	if err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный post id"})

		return

	}

	authUser := h.getUserFromRequest(r)

	if authUser == nil {

		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})

		return

	}

	if err := h.postRepo.DeletePost(postID, authUser.ID); err != nil {

		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})

		return

	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})

}

func (h *Handler) ToggleLike(w http.ResponseWriter, r *http.Request) {

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) < 4 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный путь"})

		return

	}

	postID, err := strconv.Atoi(pathParts[2])

	if err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный post id"})

		return

	}

	var req models.ToggleLikeRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})

		return

	}

	userID := req.UserID

	var authUser *models.User

	if authUser = h.getUserFromRequest(r); authUser != nil {

		userID = authUser.ID

	}

	if userID <= 0 {

		userID = 1

	}

	isLiked, count, err := h.postRepo.ToggleLike(userID, postID)

	if err != nil {

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})

		return

	}

	// Отправка уведомления автору поста

	if h.notifRepo != nil && isLiked {

		if post, _ := h.postRepo.GetPostByID(postID, userID); post != nil && post.UserID != userID {

			actorName := "Пользователь"

			if authUser != nil {

				actorName = authUser.DisplayName

			}

			_, _ = h.notifRepo.CreateNotification(post.UserID, userID, "like", postID, "")

			if h.hub != nil {

				h.hub.Broadcast(events.EventNotification, map[string]interface{}{

					"user_id": post.UserID,

					"action_type": "like",

					"actor": authUser,

					"title": fmt.Sprintf("%s оценил(а) вашу публикацию", actorName),
				})

			}

		}

	}

	if h.hub != nil {

		h.hub.Broadcast(events.EventLikeUpdate, map[string]interface{}{

			"post_id": postID,

			"likes_count": count,

			"user_id": userID,

			"is_liked": isLiked,
		})

	}

	respondJSON(w, http.StatusOK, map[string]interface{}{

		"is_liked": isLiked,

		"likes_count": count,
	})

}

func (h *Handler) CreateComment(w http.ResponseWriter, r *http.Request) {

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) < 4 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный путь"})

		return

	}

	postID, err := strconv.Atoi(pathParts[2])

	if err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный post id"})

		return

	}

	var req models.CreateCommentRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})

		return

	}

	req.Content = strings.TrimSpace(req.Content)

	if req.Content == "" {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "комментарий не может быть пустым"})

		return

	}

	userID := req.UserID

	var authUser *models.User

	if authUser = h.getUserFromRequest(r); authUser != nil {

		userID = authUser.ID

	}

	if userID <= 0 {

		userID = 1

	}

	comment, err := h.postRepo.CreateComment(postID, userID, req.Content)

	if err != nil {

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})

		return

	}

	// Отправка уведомления автору поста

	if h.notifRepo != nil {

		if post, _ := h.postRepo.GetPostByID(postID, userID); post != nil && post.UserID != userID {

			actorName := "Пользователь"

			if authUser != nil {

				actorName = authUser.DisplayName

			}

			_, _ = h.notifRepo.CreateNotification(post.UserID, userID, "comment", postID, req.Content)

			if h.hub != nil {

				h.hub.Broadcast(events.EventNotification, map[string]interface{}{

					"user_id": post.UserID,

					"action_type": "comment",

					"actor": authUser,

					"title": fmt.Sprintf("%s прокомментировал(а) вашу запись", actorName),
				})

			}

		}

	}

	if h.hub != nil {

		h.hub.Broadcast(events.EventNewComment, map[string]interface{}{

			"post_id": postID,

			"comment": comment,
		})

	}

	respondJSON(w, http.StatusCreated, comment)

}

func (h *Handler) UpdateComment(w http.ResponseWriter, r *http.Request) {

	currentUser := h.getUserFromRequest(r)

	if currentUser == nil {

		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})

		return

	}

	targetIDStr := r.PathValue("id")

	if targetIDStr == "" {

		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if len(parts) >= 3 {

			targetIDStr = parts[2]

		}

	}

	commentID, err := strconv.Atoi(targetIDStr)

	if err != nil || commentID <= 0 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID комментария"})

		return

	}

	var req models.UpdateCommentRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})

		return

	}

	req.Content = strings.TrimSpace(req.Content)

	if req.Content == "" {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "комментарий не может быть пустым"})

		return

	}

	comment, err := h.postRepo.UpdateComment(commentID, currentUser.ID, req.Content)

	if err != nil {

		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})

		return

	}

	if h.hub != nil {

		h.hub.Broadcast(events.EventCommentUpdated, map[string]interface{}{

			"comment": comment,

			"post_id": comment.PostID,
		})

	}

	respondJSON(w, http.StatusOK, comment)

}

func (h *Handler) DeleteComment(w http.ResponseWriter, r *http.Request) {

	currentUser := h.getUserFromRequest(r)

	if currentUser == nil {

		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})

		return

	}

	targetIDStr := r.PathValue("id")

	if targetIDStr == "" {

		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if len(parts) >= 3 {

			targetIDStr = parts[2]

		}

	}

	commentID, err := strconv.Atoi(targetIDStr)

	if err != nil || commentID <= 0 {

		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID комментария"})

		return

	}

	postID, err := h.postRepo.DeleteComment(commentID, currentUser.ID)

	if err != nil {

		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})

		return

	}

	if h.hub != nil {

		h.hub.Broadcast(events.EventCommentDeleted, map[string]interface{}{

			"comment_id": commentID,

			"post_id": postID,
		})

	}

	respondJSON(w, http.StatusOK, map[string]interface{}{

		"success": true,

		"post_id": postID,

		"comment_id": commentID,
	})

}
