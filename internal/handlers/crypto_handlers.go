package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"social-network/internal/crypto"
	"social-network/internal/models"
)

// RegisterCryptoKeys регистрирует или обновляет криптографические ключи пользователя.
// POST /api/crypto/keys
func (h *Handler) RegisterCryptoKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authUser := h.getUserFromRequest(r)
	if authUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var req models.RegisterKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	req.PublicKeyEd25519 = strings.TrimSpace(req.PublicKeyEd25519)
	req.PublicKeyX25519 = strings.TrimSpace(req.PublicKeyX25519)
	if req.PublicKeyEd25519 == "" && req.PublicKeyX25519 == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "At least one public key must be provided"})
		return
	}

	if req.KeyFingerprint == "" && req.PublicKeyEd25519 != "" {
		req.KeyFingerprint = crypto.ComputeFingerprint(req.PublicKeyEd25519)
	}

	err := h.cryptoRepo.UpsertKeys(authUser.ID, req.PublicKeyEd25519, req.PublicKeyX25519, req.KeyFingerprint)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"message":     "Криптографические ключи успешно зарегистрированы",
		"fingerprint": req.KeyFingerprint,
	})
}

// GetUserCryptoKeys возвращает публичные ключи пользователя для E2EE шифрования и проверки подписей.
// GET /api/crypto/keys/{userId}
func (h *Handler) GetUserCryptoKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL path"})
		return
	}
	targetUserID, err := strconv.Atoi(parts[3])
	if err != nil || targetUserID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid user ID"})
		return
	}

	keys, err := h.cryptoRepo.GetKeys(targetUserID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if keys == nil {
		// Автоматическая генерация криптографической идентичности, если пользователь обращается впервые
		edPub, _, errGen := crypto.GenerateEd25519KeyPair()
		xPub, _, _ := crypto.GenerateX25519KeyPair()
		if errGen == nil {
			fp := crypto.ComputeFingerprint(edPub)
			_ = h.cryptoRepo.UpsertKeys(targetUserID, edPub, xPub, fp)
			keys, _ = h.cryptoRepo.GetKeys(targetUserID)
		}
	}
	if keys == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Crypto keys not found for user"})
		return
	}

	respondJSON(w, http.StatusOK, keys)
}

// VerifyPostSignature проверяет подлинность Ed25519 цифровой подписи публикации.
// POST /api/crypto/verify-post
func (h *Handler) VerifyPostSignature(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.VerifyPostSignatureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	post, err := h.postRepo.GetPostByID(req.PostID, 0)
	if err != nil || post == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Post not found"})
		return
	}

	pubKey := req.AuthorPubKey
	if pubKey == "" {
		pubKey = post.AuthorPubKey
	}
	sig := req.Signature
	if sig == "" {
		sig = post.Signature
	}

	if pubKey == "" || sig == "" {
		respondJSON(w, http.StatusOK, models.VerifySignatureResponse{
			IsValid:           false,
			SignerFingerprint: "No cryptographic signature attached",
			Algorithm:         "Ed25519",
		})
		return
	}

	contentHash := crypto.ComputePostContentHash(post.UserID, post.Content, post.ImageURL, post.MusicURL, post.ChannelID, post.PollID)
	isValid := crypto.VerifySignature(pubKey, contentHash, sig)
	fp := crypto.ComputeFingerprint(pubKey)

	respondJSON(w, http.StatusOK, models.VerifySignatureResponse{
		IsValid:           isValid,
		SignerFingerprint: fp,
		Algorithm:         "Ed25519",
	})
}
