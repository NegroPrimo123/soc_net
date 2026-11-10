package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/models"
)

// ListChannels возвращает список каналов по фильтру (subscribed, my) или поисковому запросу q
func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	filter := r.URL.Query().Get("filter")
	searchQuery := r.URL.Query().Get("q")

	currentUserID := 0
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	}

	if filter == "" && searchQuery == "" {
		if currentUserID > 0 {
			filter = "subscribed"
		} else {
			filter = "all"
		}
	}

	channels, err := h.channelRepo.ListChannels(currentUserID, filter, searchQuery)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if channels == nil {
		channels = []models.Channel{}
	}

	respondJSON(w, http.StatusOK, channels)
}

// GetUserChannelConversations возвращает все диалоги пользователя с каналами
func (h *Handler) GetUserChannelConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	convs, err := h.channelRepo.GetUserChannelConversations(authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if convs == nil {
		convs = []models.ChannelConversation{}
	}

	respondJSON(w, http.StatusOK, convs)
}

// CreateChannel создает новый канал
func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	var req models.CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат данных"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "название канала обязательно"})
		return
	}

	channel, err := h.channelRepo.CreateChannel(authUser.ID, req)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, channel)
}

// GetChannel возвращает канал по ID или handle
func (h *Handler) GetChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	param := pathParts[2]
	currentUserID := 0
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	}

	var channel *models.Channel
	var err error

	if channelID, parseErr := strconv.Atoi(param); parseErr == nil {
		channel, err = h.channelRepo.GetChannelByID(channelID, currentUserID)
	} else {
		channel, err = h.channelRepo.GetChannelByHandle(param, currentUserID)
	}

	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, channel)
}

// UpdateChannel обновляет оформление канала (аватарка, баннер, описание, имя)
func (h *Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch && r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	var req models.UpdateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат данных"})
		return
	}

	channel, err := h.channelRepo.UpdateChannel(channelID, authUser.ID, req)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, channel)
}

// DeleteChannel удаляет канал
func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	if err := h.channelRepo.DeleteChannel(channelID, authUser.ID); err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// SubscribeChannel оформляет подписку на канал
func (h *Handler) SubscribeChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	if err := h.channelRepo.Subscribe(channelID, authUser.ID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	count, _ := h.channelRepo.GetSubscribersCount(channelID)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "subscribed",
		"subscribers_count": count,
		"is_subscribed":     true,
	})
}

// UnsubscribeChannel отменяет подписку на канал
func (h *Handler) UnsubscribeChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	if err := h.channelRepo.Unsubscribe(channelID, authUser.ID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	count, _ := h.channelRepo.GetSubscribersCount(channelID)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":            "unsubscribed",
		"subscribers_count": count,
		"is_subscribed":     false,
	})
}

// GetChannelPosts возвращает ленту постов конкретного канала
func (h *Handler) GetChannelPosts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	currentUserID := 0
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	posts, err := h.postRepo.GetChannelPosts(channelID, currentUserID, limit, offset)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, posts)
}

// CreateChannelPost публикует новый пост в канале (только создатель или админ)
func (h *Handler) CreateChannelPost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	channel, err := h.channelRepo.GetChannelByID(channelID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "канал не найден"})
		return
	}

	if channel.Role != "creator" && channel.Role != "admin" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "только администраторы канала могут публиковать посты"})
		return
	}

	var req models.CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.MusicURL = strings.TrimSpace(req.MusicURL)

	if req.Content == "" && req.ImageURL == "" && req.MusicURL == "" && req.PollID == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "пост канала не может быть пустым"})
		return
	}

	cID := channelID
	post, err := h.postRepo.CreatePost(authUser.ID, req.Content, req.ImageURL, req.MusicURL, req.MusicTitle, req.MusicArtist, &cID, req.PollID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, post)
}

// GetChannelConversations возвращает список входящих диалогов подписчиков с каналом (для создателя)
func (h *Handler) GetChannelConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	convs, err := h.channelRepo.GetChannelConversations(channelID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, convs)
}

// GetChannelMessages возвращает сообщения анонимного чата с каналом
func (h *Handler) GetChannelMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	channel, err := h.channelRepo.GetChannelByID(channelID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "канал не найден"})
		return
	}

	targetSubscriberID := authUser.ID
	// Если запрашивает создатель канала и передан параметр subscriber_id
	if channel.Role == "creator" || channel.Role == "admin" {
		subQuery := r.URL.Query().Get("subscriber_id")
		if subQuery != "" {
			if sID, err := strconv.Atoi(subQuery); err == nil && sID > 0 {
				targetSubscriberID = sID
			}
		}
	}

	// Помечаем входящие сообщения в диалоге канала как прочитанные
	_ = h.messageRepo.MarkChannelMessagesAsRead(channelID, targetSubscriberID, authUser.ID)

	messages, err := h.messageRepo.GetChannelConversation(channelID, targetSubscriberID, authUser.ID, 100)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if messages == nil {
		messages = []models.Message{}
	}

	respondJSON(w, http.StatusOK, messages)
}

// SendChannelMessage отправляет анонимное сообщение каналу или ответ канала подписчику
func (h *Handler) SendChannelMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID канала"})
		return
	}

	channelID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID канала"})
		return
	}

	channel, err := h.channelRepo.GetChannelByID(channelID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "канал не найден"})
		return
	}

	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	req.AudioURL = strings.TrimSpace(req.AudioURL)

	if req.Content == "" && req.AudioURL == "" && req.PollID == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "сообщение не может быть пустым"})
		return
	}

	isFromChannel := false
	receiverID := channel.CreatorID

	// Если отправитель - создатель или админ канала, он может отвечать от имени канала
	if channel.Role == "creator" || channel.Role == "admin" {
		if req.ReceiverID > 0 && req.ReceiverID != authUser.ID {
			receiverID = req.ReceiverID
			isFromChannel = true
		}
	}

	cID := channelID
	msg, err := h.messageRepo.SendMessage(authUser.ID, receiverID, req.Content, req.AudioURL, req.AudioTitle, req.AudioArtist, &cID, isFromChannel, req.PollID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, msg)
}
