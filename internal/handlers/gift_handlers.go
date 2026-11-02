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

func (h *Handler) SendGift(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в аккаунт, чтобы отправлять подарки"})
		return
	}

	var req models.SendGiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный формат запроса"})
		return
	}

	if req.ReceiverID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Не указан получатель подарка"})
		return
	}

	if req.GiftType == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Выберите тип подарка"})
		return
	}

	req.SenderID = currentUser.ID

	gift, err := h.giftRepo.SendGift(&req)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Создаем уведомление получателю
	if h.notifRepo != nil && gift.ReceiverID != currentUser.ID {
		_, _ = h.notifRepo.CreateNotification(gift.ReceiverID, currentUser.ID, "gift", gift.ID, gift.GiftType)
		if h.hub != nil {
			h.hub.Broadcast(events.EventNotification, map[string]interface{}{
				"user_id":     gift.ReceiverID,
				"action_type": "gift",
				"actor":       currentUser,
				"title":       fmt.Sprintf("%s отправил(а) вам подарок!", currentUser.DisplayName),
			})
		}
	}

	// Рассылка real-time события через SSE
	if h.hub != nil {
		h.hub.Broadcast(events.EventNewGift, map[string]interface{}{
			"gift":        gift,
			"receiver_id": gift.ReceiverID,
		})
	}

	respondJSON(w, http.StatusCreated, gift)
}

func (h *Handler) GetShowcaseGifts(w http.ResponseWriter, r *http.Request) {
	gifts, err := h.giftRepo.GetAllShowcase(40)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if gifts == nil {
		gifts = []models.Gift{}
	}
	respondJSON(w, http.StatusOK, gifts)
}

// ToggleHideGift позволяет скрыть или показать подарок в профиле получателя
func (h *Handler) ToggleHideGift(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в аккаунт"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный путь"})
		return
	}

	giftID, err := strconv.Atoi(pathParts[2])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Неверный ID подарка"})
		return
	}

	isHidden, err := h.giftRepo.ToggleHide(giftID, currentUser.ID)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"gift_id":   giftID,
		"is_hidden": isHidden,
		"status":    "ok",
	})
}
