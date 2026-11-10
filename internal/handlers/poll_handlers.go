package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/models"
)

// CreatePoll создает новый опрос
func (h *Handler) CreatePoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	var req models.CreatePollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	poll, err := h.pollRepo.CreatePoll(authUser.ID, req)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, poll)
}

// GetPoll возвращает данные опроса по ID
func (h *Handler) GetPoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID опроса"})
		return
	}

	pollID, err := strconv.Atoi(pathParts[2])
	if err != nil || pollID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID опроса"})
		return
	}

	currentUserID := 0
	if authUser := h.getUserFromRequest(r); authUser != nil {
		currentUserID = authUser.ID
	}

	poll, err := h.pollRepo.GetPollByID(pollID, currentUserID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, poll)
}

// VotePoll голосует за вариант в опросе
func (h *Handler) VotePoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "метод не поддерживается"})
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "необходима авторизация"})
		return
	}

	var req models.VotePollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	if req.PollID <= 0 || req.OptionID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "некорректные параметры опроса или варианта"})
		return
	}

	poll, err := h.pollRepo.VotePoll(req.PollID, req.OptionID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, poll)
}

// UnvotePoll отменяет выбор в опросе
func (h *Handler) UnvotePoll(w http.ResponseWriter, r *http.Request) {
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
	if len(pathParts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID опроса"})
		return
	}

	pollID, err := strconv.Atoi(pathParts[2])
	if err != nil || pollID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID опроса"})
		return
	}

	poll, err := h.pollRepo.UnvotePoll(pollID, authUser.ID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, poll)
}

// UpdatePoll редактирует вопрос и варианты ответов опроса
func (h *Handler) UpdatePoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
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
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "не указан ID опроса"})
		return
	}

	pollID, err := strconv.Atoi(pathParts[2])
	if err != nil || pollID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный ID опроса"})
		return
	}

	var req models.UpdatePollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "неверный формат запроса"})
		return
	}

	updatedPoll, err := h.pollRepo.UpdatePoll(pollID, authUser.ID, req)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, updatedPoll)
}
