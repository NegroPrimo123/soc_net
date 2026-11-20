package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// BlockUser добавляет пользователя в черный список.
func (h *Handler) BlockUser(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	var targetID int
	idStr := r.PathValue("id")
	if idStr != "" {
		targetID, _ = strconv.Atoi(idStr)
	}

	if targetID <= 0 {
		var req struct {
			UserID int `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.UserID > 0 {
			targetID = req.UserID
		}
	}

	if targetID <= 0 {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 3 && parts[2] != "block" {
			targetID, _ = strconv.Atoi(parts[2])
		}
	}

	if targetID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID пользователя"})
		return
	}

	if targetID == currentUser.ID {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "нельзя заблокировать самого себя"})
		return
	}

	if err := h.blockRepo.BlockUser(currentUser.ID, targetID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"status":     "blocked",
		"blocked_id": targetID,
	})
}

// UnblockUser удаляет пользователя из черного списка.
func (h *Handler) UnblockUser(w http.ResponseWriter, r *http.Request) {
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
	targetID, err := strconv.Atoi(idStr)
	if err != nil || targetID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID пользователя"})
		return
	}

	if err := h.blockRepo.UnblockUser(currentUser.ID, targetID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"status":       "unblocked",
		"unblocked_id": targetID,
	})
}

// GetBlacklist возвращает список заблокированных пользователей текущего пользователя.
func (h *Handler) GetBlacklist(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "не авторизован"})
		return
	}

	blacklist, err := h.blockRepo.GetBlacklist(currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, blacklist)
}

// CheckBlockStatus проверяет статус блокировки между текущим пользователем и целевым.
func (h *Handler) CheckBlockStatus(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusOK, map[string]bool{"is_blocked": false, "is_blocker": false})
		return
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

	isBlocker, _ := h.blockRepo.IsUserBlocked(currentUser.ID, targetID)
	isBlocked, _ := h.blockRepo.IsUserBlocked(targetID, currentUser.ID)

	respondJSON(w, http.StatusOK, map[string]bool{
		"is_blocked_by_me":         isBlocker,
		"is_blocked_by_them":       isBlocked,
		"is_blocked":               isBlocker || isBlocked,
		"is_communication_blocked": isBlocker || isBlocked,
	})
}
