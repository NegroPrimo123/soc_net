package handlers

import (
	"net/http"
	"strconv"
)

// GetAchievements returns the achievement progress, total XP and level tiers for current user
func (h *Handler) GetAchievements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	user := h.getUserFromRequest(r)
	if user == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "требуется авторизация"})
		return
	}

	resp, err := h.achievementRepo.GetAchievements(user.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

// GetPublicUserAchievements returns the achievements for a specified user
func (h *Handler) GetPublicUserAchievements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	idStr := r.PathValue("id")
	targetUserID, err := strconv.Atoi(idStr)
	if err != nil || targetUserID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID пользователя"})
		return
	}

	resp, err := h.achievementRepo.GetAchievements(targetUserID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}
