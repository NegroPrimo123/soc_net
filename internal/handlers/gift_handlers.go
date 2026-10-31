package handlers

import (
	"encoding/json"
	"net/http"

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

	// Рассылка real-time события через SSE
	if h.hub != nil {
		h.hub.Broadcast("new_gift", map[string]interface{}{
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
