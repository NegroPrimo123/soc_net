package handlers

import (
	"encoding/json"
	"net/http"

	"social-network/internal/models"
)

func (h *Handler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в систему для просмотра уведомлений"})
		return
	}

	if h.notifRepo == nil {
		respondJSON(w, http.StatusOK, []models.GroupedNotification{})
		return
	}

	notifs, err := h.notifRepo.GetGroupedNotifications(currentUser.ID, 50)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if notifs == nil {
		notifs = []models.GroupedNotification{}
	}

	respondJSON(w, http.StatusOK, notifs)
}

func (h *Handler) MarkNotificationsAsRead(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в систему"})
		return
	}

	var req models.MarkNotificationsReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный формат запроса"})
		return
	}

	if err := h.notifRepo.MarkAsRead(currentUser.ID, req.IDs); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) MarkAllNotificationsAsRead(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в систему"})
		return
	}

	if err := h.notifRepo.MarkAllAsRead(currentUser.ID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) GetUnreadNotificationsCount(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusOK, map[string]int{"unread_count": 0})
		return
	}

	count, err := h.notifRepo.GetUnreadCount(currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]int{"unread_count": count})
}
