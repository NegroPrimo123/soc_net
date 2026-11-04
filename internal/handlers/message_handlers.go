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

	// Защита прав доступа: пользователь не может запрашивать чужую переписку (403 Forbidden)
	q := r.URL.Query()
	u1Str := q.Get("user1")
	u2Str := q.Get("user2")
	if u1Str != "" && u2Str != "" {
		u1, _ := strconv.Atoi(u1Str)
		u2, _ := strconv.Atoi(u2Str)
		if currentUser.ID != u1 && currentUser.ID != u2 {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "доступ запрещен: вы не являетесь участником этой переписки"})
			return
		}
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

func (h *Handler) UpdateMessage(w http.ResponseWriter, r *http.Request) {
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
	msgID, err := strconv.Atoi(targetIDStr)
	if err != nil || msgID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID сообщения"})
		return
	}

	var req models.UpdateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "текст сообщения не может быть пустым"})
		return
	}

	msg, err := h.messageRepo.UpdateMessage(msgID, currentUser.ID, req.Content)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(events.EventMessageUpdated, msg)
	}

	respondJSON(w, http.StatusOK, msg)
}

func (h *Handler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
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
	msgID, err := strconv.Atoi(targetIDStr)
	if err != nil || msgID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID сообщения"})
		return
	}

	forEveryone := (r.URL.Query().Get("for_everyone") == "true" || r.URL.Query().Get("for_all") == "1")
	if r.Header.Get("Content-Type") == "application/json" && r.Body != nil {
		var delReq models.DeleteMessageRequest
		if err := json.NewDecoder(r.Body).Decode(&delReq); err == nil && delReq.ForEveryone {
			forEveryone = true
		}
	}

	err = h.messageRepo.DeleteMessage(msgID, currentUser.ID, forEveryone)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(events.EventMessageDeleted, map[string]interface{}{
			"message_id":   msgID,
			"for_everyone": forEveryone,
			"user_id":      currentUser.ID,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"message_id":   msgID,
		"for_everyone": forEveryone,
	})
}

func (h *Handler) BatchDeleteMessages(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	var req models.BatchDeleteMessagesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}
	if len(req.MessageIDs) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не выбраны сообщения для удаления"})
		return
	}

	deletedCount, err := h.messageRepo.BatchDeleteMessages(req.MessageIDs, currentUser.ID, req.ForEveryone)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(events.EventMessageDeleted, map[string]interface{}{
			"message_ids":  req.MessageIDs,
			"for_everyone": req.ForEveryone,
			"user_id":      currentUser.ID,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"deleted_count": deletedCount,
		"for_everyone":  req.ForEveryone,
	})
}
