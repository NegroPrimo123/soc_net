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

func (h *Handler) GetConversations(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	convs, err := h.messageRepo.GetConversationsList(currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if convs == nil {
		convs = []models.Conversation{}
	}

	respondJSON(w, http.StatusOK, convs)
}

func (h *Handler) GetMessages(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	targetIDStr := r.PathValue("userId")
	if targetIDStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			targetIDStr = parts[2]
		}
	}

	otherUserID, err := strconv.Atoi(targetIDStr)
	if err != nil || otherUserID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID пользователя"})
		return
	}

	// Помечаем входящие сообщения от этого собеседника как прочитанные
	_ = h.messageRepo.MarkAsRead(currentUser.ID, otherUserID)

	messages, err := h.messageRepo.GetConversation(currentUser.ID, otherUserID, 100)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if messages == nil {
		messages = []models.Message{}
	}

	respondJSON(w, http.StatusOK, messages)
}

func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "сообщение не может быть пустым"})
		return
	}

	if req.ReceiverID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан получатель"})
		return
	}

	if req.ReceiverID == currentUser.ID {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "нельзя отправить сообщение самому себе"})
		return
	}

	msg, err := h.messageRepo.SendMessage(currentUser.ID, req.ReceiverID, req.Content)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Создаем уведомление получателю о новом личном сообщении
	if h.notifRepo != nil {
		_, _ = h.notifRepo.CreateNotification(req.ReceiverID, currentUser.ID, "message", currentUser.ID, req.Content)
		if h.hub != nil {
			h.hub.Broadcast(events.EventNotification, map[string]interface{}{
				"user_id":     req.ReceiverID,
				"action_type": "message",
				"actor":       currentUser,
				"title":       fmt.Sprintf("Новое сообщение от %s", currentUser.DisplayName),
				"content":     req.Content,
			})
		}
	}

	// Рассылка real-time события через SSE
	if h.hub != nil {
		h.hub.Broadcast(events.EventNewMessage, msg)
	}

	respondJSON(w, http.StatusCreated, msg)
}

func (h *Handler) GetUnreadMessagesCount(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	count, err := h.messageRepo.GetUnreadCount(currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]int{"unread_count": count})
}
