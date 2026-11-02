package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"social-network/internal/events"
	"social-network/internal/models"
)

type ProfileDataResponse struct {
	User        models.User   `json:"user"`
	Posts       []models.Post `json:"posts"`
	Gifts       []models.Gift `json:"gifts"`
	Followers   []models.User `json:"followers"`
	Following   []models.User `json:"following"`
	IsOwner     bool          `json:"is_owner"`
	IsFollowing bool          `json:"is_following"`
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

func (h *Handler) GetUserProfile(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	if idStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			idStr = parts[2]
		}
	}

	profileUserID, err := strconv.Atoi(idStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный ID пользователя"})
		return
	}

	var currentUserID int
	currentUser := h.getUserFromRequest(r)
	if currentUser != nil {
		currentUserID = currentUser.ID
	}

	targetUser, err := h.userRepo.GetByID(profileUserID, currentUserID)
	if err != nil || targetUser == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Пользователь не найден"})
		return
	}

	var (
		posts     []models.Post
		gifts     []models.Gift
		followers []models.User
		following []models.User
		wg        sync.WaitGroup
	)

	isOwner := (currentUserID == profileUserID)

	// Параллельная загрузка данных профиля в 4 потока для минимизации TTFB
	wg.Add(4)
	go func() {
		defer wg.Done()
		p, _ := h.postRepo.GetPostsByUserID(profileUserID, currentUserID)
		if p == nil {
			p = []models.Post{}
		}
		posts = p
	}()
	go func() {
		defer wg.Done()
		// Владелец видит свои скрытые подарки, гости видят только открытые
		g, _ := h.giftRepo.GetByReceiverID(profileUserID, isOwner)
		if g == nil {
			g = []models.Gift{}
		}
		gifts = g
	}()
	go func() {
		defer wg.Done()
		f, _ := h.userRepo.GetFollowers(profileUserID, currentUserID)
		if f == nil {
			f = []models.User{}
		}
		followers = f
	}()
	go func() {
		defer wg.Done()
		fo, _ := h.userRepo.GetFollowing(profileUserID, currentUserID)
		if fo == nil {
			fo = []models.User{}
		}
		following = fo
	}()
	wg.Wait()

	resp := ProfileDataResponse{
		User:        *targetUser,
		Posts:       posts,
		Gifts:       gifts,
		Followers:   followers,
		Following:   following,
		IsOwner:     isOwner,
		IsFollowing: targetUser.IsFollowing,
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetUserGifts(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	if idStr == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 {
			idStr = parts[2]
		}
	}

	userID, err := strconv.Atoi(idStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный ID пользователя"})
		return
	}

	currentUser := h.getUserFromRequest(r)
	isOwner := currentUser != nil && currentUser.ID == userID

	gifts, err := h.giftRepo.GetByReceiverID(userID, isOwner)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if gifts == nil {
		gifts = []models.Gift{}
	}

	respondJSON(w, http.StatusOK, gifts)
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в аккаунт"})
		return
	}

	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный формат запроса"})
		return
	}

	if strings.TrimSpace(req.DisplayName) == "" {
		req.DisplayName = currentUser.DisplayName
	}
	if strings.TrimSpace(req.AvatarURL) == "" {
		req.AvatarURL = currentUser.AvatarURL
	}

	updated, err := h.userRepo.UpdateProfile(currentUser.ID, req.DisplayName, req.Bio, req.AvatarURL, req.BannerURL)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

func (h *Handler) ToggleFollow(w http.ResponseWriter, r *http.Request) {
	var req models.ToggleFollowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный payload"})
		return
	}

	followerID := req.FollowerID
	var authUser *models.User
	if authUser = h.getUserFromRequest(r); authUser != nil {
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

	// Отправка уведомления при подписке
	if h.notifRepo != nil && isFollowing && req.FollowingID != followerID {
		actorName := "Пользователь"
		if authUser != nil {
			actorName = authUser.DisplayName
		}
		_, _ = h.notifRepo.CreateNotification(req.FollowingID, followerID, "follow", followerID, "")
		if h.hub != nil {
			h.hub.Broadcast(events.EventNotification, map[string]interface{}{
				"user_id":     req.FollowingID,
				"action_type": "follow",
				"actor":       authUser,
				"title":       fmt.Sprintf("%s подписался(-лась) на вас", actorName),
			})
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"is_following": isFollowing,
	})
}
