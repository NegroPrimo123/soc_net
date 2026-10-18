package handlers

import (
	"encoding/json"
	"html/template"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"social-network/internal/models"
	"social-network/internal/repository"
)

type Handler struct {
	userRepo *repository.UserRepository
	postRepo *repository.PostRepository
	tmpl     *template.Template
}

func NewHandler(userRepo *repository.UserRepository, postRepo *repository.PostRepository) (*Handler, error) {
	tmplPath := filepath.Join("web", "templates", "index.html")
	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		return nil, err
	}

	return &Handler{
		userRepo: userRepo,
		postRepo: postRepo,
		tmpl:     tmpl,
	}, nil
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

	// Fallback to Oleg (user 1) if not authenticated and no user_id param
	if currentUser == nil {
		currentUser, _ = h.userRepo.GetByID(1, 1)
		if currentUser != nil {
			currentUserID = currentUser.ID
		}
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

	posts, err := h.postRepo.GetFeed(currentUserID, feedType, searchQuery, tagQuery)
	if err != nil {
		http.Error(w, "Failed to load feed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"CurrentUser":     currentUser,
		"IsAuthenticated": isAuthenticated,
		"Users":           users,
		"Posts":           posts,
		"FeedType":        feedType,
		"SearchQuery":     searchQuery,
		"TagQuery":        tagQuery,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := h.tmpl.Execute(w, data); err != nil {
		http.Error(w, "Template execution error: "+err.Error(), http.StatusInternalServerError)
	}
}

// ==========================================
// AUTHENTICATION HANDLERS
// ==========================================

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Password = strings.TrimSpace(req.Password)

	if len(req.Username) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "логин должен содержать не менее 3 символов"})
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	if len(req.Password) < 6 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "пароль должен содержать не менее 6 символов"})
		return
	}

	user, err := h.userRepo.CreateUser(req.Username, req.DisplayName, req.Password, req.AvatarURL, req.Bio)
	if err != nil {
		respondJSON(w, http.StatusConflict, map[string]string{"error": "пользователь с таким логином уже существует"})
		return
	}

	token, err := h.userRepo.CreateSession(user.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "ошибка создания сессии"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusCreated, models.AuthResponse{
		User:  *user,
		Token: token,
	})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.Password = strings.TrimSpace(req.Password)

	user, err := h.userRepo.Authenticate(req.Username, req.Password)
	if err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	token, err := h.userRepo.CreateSession(user.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "ошибка создания сессии"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, models.AuthResponse{
		User:  *user,
		Token: token,
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("session_token"); err == nil && cookie.Value != "" {
		_ = h.userRepo.DeleteSession(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	respondJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}
	respondJSON(w, http.StatusOK, user)
}

// ==========================================
// FEED & POST HANDLERS
// ==========================================

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

	posts, err := h.postRepo.GetFeed(currentUserID, feedType, searchQuery, tagQuery)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, posts)
}

func (h *Handler) CreatePost(w http.ResponseWriter, r *http.Request) {
	var req models.CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" && req.ImageURL == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "публикация не может быть пустой"})
		return
	}
	req.ImageURL = strings.TrimSpace(req.ImageURL)

	// Auth check or fallback
	userID := req.UserID
	if authUser := h.getUserFromRequest(r); authUser != nil {
		userID = authUser.ID
	}
	if userID <= 0 {
		userID = 1
	}

	post, err := h.postRepo.CreatePost(userID, req.Content, req.ImageURL)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
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

	var req models.UpdatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "текст не может быть пустым"})
		return
	}

	userID := req.UserID
	if authUser := h.getUserFromRequest(r); authUser != nil {
		userID = authUser.ID
	}
	if userID <= 0 {
		userID = 1
	}

	post, err := h.postRepo.UpdatePost(postID, userID, req.Content)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, post)
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
	if authUser := h.getUserFromRequest(r); authUser != nil {
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

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"is_liked":    isLiked,
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
	if authUser := h.getUserFromRequest(r); authUser != nil {
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

	respondJSON(w, http.StatusCreated, comment)
}

func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	currentUserID := 1
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil {
			currentUserID = uid
		}
	}

	users, err := h.userRepo.GetAll(currentUserID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, users)
}

func (h *Handler) ToggleFollow(w http.ResponseWriter, r *http.Request) {
	var req models.ToggleFollowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	followerID := req.FollowerID
	if authUser := h.getUserFromRequest(r); authUser != nil {
		followerID = authUser.ID
	}
	if followerID <= 0 {
		followerID = 1
	}

	isFollowing, err := h.userRepo.ToggleFollow(followerID, req.FollowingID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"is_following": isFollowing,
	})
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

	currentUserID := 1
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	} else if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
		if uid, err := strconv.Atoi(uidStr); err == nil {
			currentUserID = uid
		}
	}

	if err := h.postRepo.DeletePost(postID, currentUserID); err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
