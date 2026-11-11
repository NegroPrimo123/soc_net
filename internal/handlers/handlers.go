package handlers

import (
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"social-network/internal/events"
	"social-network/internal/models"
	"social-network/internal/repository"
)

type Handler struct {
	userRepo    *repository.UserRepository
	postRepo    *repository.PostRepository
	giftRepo    *repository.GiftRepository
	messageRepo *repository.MessageRepository
	notifRepo   *repository.NotificationRepository
	channelRepo *repository.ChannelRepository
	pollRepo    *repository.PollRepository
	achievementRepo *repository.AchievementRepository
	hub         *events.Hub
	tmpl        *template.Template
}

func NewHandler(
	userRepo *repository.UserRepository,
	postRepo *repository.PostRepository,
	giftRepo *repository.GiftRepository,
	messageRepo *repository.MessageRepository,
	notifRepo *repository.NotificationRepository,
	channelRepo *repository.ChannelRepository,
	pollRepo *repository.PollRepository,
	achievementRepo *repository.AchievementRepository,
	hub *events.Hub,
) (*Handler, error) {
	tmplPath := filepath.Join("web", "templates", "index.html")
	if _, err := os.Stat(tmplPath); os.IsNotExist(err) {
		tmplPath = filepath.Join("..", "..", "web", "templates", "index.html")
	}
	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		tmpl = template.Must(template.New("index.html").Parse("<!DOCTYPE html><html><body>{{.CurrentUser.Username}}</body></html>"))
	}

	return &Handler{
		userRepo:        userRepo,
		postRepo:        postRepo,
		giftRepo:        giftRepo,
		messageRepo:     messageRepo,
		notifRepo:       notifRepo,
		channelRepo:     channelRepo,
		pollRepo:        pollRepo,
		achievementRepo: achievementRepo,
		hub:             hub,
		tmpl:            tmpl,
	}, nil
}

func (h *Handler) SSEHandler(w http.ResponseWriter, r *http.Request) {
	if h.hub != nil {
		h.hub.SSEHandler(w, r)
	} else {
		http.Error(w, "SSE hub not initialized", http.StatusInternalServerError)
	}
}

func (h *Handler) getUserFromRequest(r *http.Request) *models.User {
	var token string
	if cookie, err := r.Cookie("session_token"); err == nil && cookie.Value != "" {
		token = cookie.Value
	} else if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		token = strings.TrimPrefix(authHeader, "Bearer ")
	} else if queryToken := r.URL.Query().Get("token"); queryToken != "" {
		token = queryToken
	}

	if token != "" {
		u, err := h.userRepo.GetUserBySession(token)
		if err == nil && u != nil {
			return u
		}
	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil && uid > 0 {
			u, _ := h.userRepo.GetByID(uid, uid)
			if u != nil {
				return u
			}
		}
	}
	return nil
}

func (h *Handler) Index(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	currentUser := h.getUserFromRequest(r)
	isAuthenticated := (currentUser != nil)

	if queryToken := r.URL.Query().Get("token"); queryToken != "" && currentUser != nil {
		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    queryToken,
			Path:     "/",
			Expires:  time.Now().Add(30 * 24 * time.Hour),
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
	}

	currentUserID := 0
	if currentUser != nil {
		currentUserID = currentUser.ID
	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil && uid > 0 {
			currentUserID = uid
			currentUser, _ = h.userRepo.GetByID(uid, uid)
		}
	}

	// Если пользователь не авторизован — работаем в гостевом режиме (НЕ логиним принудительно!)
	if currentUser == nil {
		currentUser = &models.User{
			ID:          0,
			Username:    "guest",
			DisplayName: "Гость",
			AvatarURL:   "/static/avatars/default.svg",
		}
		isAuthenticated = false
	}

	feedType := r.URL.Query().Get("feed_type")
	if feedType == "" {
		feedType = "all"
	}
	searchQuery := strings.TrimSpace(r.URL.Query().Get("q"))
	tagQuery := strings.TrimSpace(r.URL.Query().Get("tag"))

	users, err := h.userRepo.GetAll(currentUserID)
	if err != nil {
		http.Error(w, "Failed to load users: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Первичная загрузка страницы: первые 10 постов
	posts, err := h.postRepo.GetFeed(currentUserID, feedType, searchQuery, tagQuery, 10, 0)
	if err != nil {
		http.Error(w, "Failed to load feed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	unreadMessagesCount := 0
	if h.messageRepo != nil && currentUser != nil {
		unreadMessagesCount, _ = h.messageRepo.GetUnreadCount(currentUser.ID)
	}

	unreadNotifsCount := 0
	if h.notifRepo != nil && currentUser != nil {
		unreadNotifsCount, _ = h.notifRepo.GetUnreadCount(currentUser.ID)
	}

	data := map[string]interface{}{
		"CurrentUser":         currentUser,
		"IsAuthenticated":     isAuthenticated,
		"Users":               users,
		"Posts":               posts,
		"FeedType":            feedType,
		"SearchQuery":         searchQuery,
		"TagQuery":            tagQuery,
		"UnreadMessagesCount": unreadMessagesCount,
		"UnreadNotifsCount":   unreadNotifsCount,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := h.tmpl.Execute(w, data); err != nil {
		http.Error(w, "Template execution error: "+err.Error(), http.StatusInternalServerError)
	}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
