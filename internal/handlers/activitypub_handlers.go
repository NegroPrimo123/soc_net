package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// WebFinger реализует RFC 7033 / W3C ActivityPub discovery.
// GET /.well-known/webfinger?resource=acct:username@domain
func (h *Handler) WebFinger(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resource := r.URL.Query().Get("resource")
	if resource == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "resource parameter is required"})
		return
	}

	// Извлекаем username: "acct:oleg@domain" -> "oleg"
	handle := strings.TrimPrefix(resource, "acct:")
	parts := strings.Split(handle, "@")
	username := parts[0]

	user, err := h.userRepo.GetByUsername(username)
	if err != nil || user == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "User not found"})
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost:8080"
	}

	actorURI := fmt.Sprintf("%s://%s/api/activitypub/users/%d", scheme, host, user.ID)
	profileURI := fmt.Sprintf("%s://%s/?view=profile&user=%d", scheme, host, user.ID)
	didURI := fmt.Sprintf("did:gosocial:user:%d", user.ID)

	w.Header().Set("Content-Type", "application/jrd+json; charset=utf-8")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"subject": fmt.Sprintf("acct:%s@%s", user.Username, host),
		"aliases": []string{
			actorURI,
			profileURI,
			didURI,
		},
		"links": []map[string]string{
			{
				"rel":  "self",
				"type": "application/activity+json",
				"href": actorURI,
			},
			{
				"rel":  "http://webfinger.net/rel/profile-page",
				"type": "text/html",
				"href": profileURI,
			},
			{
				"rel":  "https://www.w3.org/ns/did#resolver",
				"type": "application/did+ld+json",
				"href": fmt.Sprintf("%s://%s/api/did/users/%d", scheme, host, user.ID),
			},
		},
	})
}

// ActivityPubActor отдает W3C ActivityStreams 2.0 Actor JSON-LD документ.
// GET /api/activitypub/users/{id}
func (h *Handler) ActivityPubActor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL path"})
		return
	}
	userID, err := strconv.Atoi(parts[3])
	if err != nil || userID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid user ID"})
		return
	}

	user, err := h.userRepo.GetByID(userID, 0)
	if err != nil || user == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "User not found"})
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost:8080"
	}

	actorURI := fmt.Sprintf("%s://%s/api/activitypub/users/%d", scheme, host, user.ID)
	keyID := fmt.Sprintf("%s#main-key", actorURI)

	// Достаем публичный ключ пользователя
	pubKeyEd25519 := "0xfeed...ed25519"
	if h.cryptoRepo != nil {
		keys, err := h.cryptoRepo.GetKeys(user.ID)
		if err == nil && keys != nil && keys.PublicKeyEd25519 != "" {
			pubKeyEd25519 = keys.PublicKeyEd25519
		}
	}

	pubKeyPEM := fmt.Sprintf("-----BEGIN PUBLIC KEY-----\n%s\n-----END PUBLIC KEY-----", pubKeyEd25519)

	w.Header().Set("Content-Type", "application/activity+json; charset=utf-8")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"@context": []string{
			"https://www.w3.org/ns/activitystreams",
			"https://w3id.org/security/v1",
		},
		"id":                actorURI,
		"type":              "Person",
		"preferredUsername": user.Username,
		"name":              user.DisplayName,
		"summary":           user.Bio,
		"url":               fmt.Sprintf("%s://%s/?view=profile&user=%d", scheme, host, user.ID),
		"icon": map[string]string{
			"type": "Image",
			"url":  user.AvatarURL,
		},
		"inbox":  fmt.Sprintf("%s://%s/api/activitypub/inbox", scheme, host),
		"outbox": fmt.Sprintf("%s://%s/api/activitypub/outbox", scheme, host),
		"publicKey": map[string]string{
			"id":           keyID,
			"owner":        actorURI,
			"publicKeyPem": pubKeyPEM,
		},
		"did": fmt.Sprintf("did:gosocial:user:%d", user.ID),
	})
}

// ActivityPubInbox принимает входящие W3C ActivityStreams активности.
// POST /api/activitypub/inbox
func (h *Handler) ActivityPubInbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var activity map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&activity); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ActivityStreams JSON"})
		return
	}

	w.Header().Set("Content-Type", "application/activity+json; charset=utf-8")
	respondJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":  "accepted",
		"message": "ActivityPub activity accepted by GoSocial Mesh node",
		"type":    activity["type"],
	})
}

// ActivityPubOutbox отдает публичную ленту в формате W3C OrderedCollection.
// GET /api/activitypub/outbox
func (h *Handler) ActivityPubOutbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	posts, err := h.postRepo.GetFeed(0, "all", "", "", 20, 0)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost:8080"
	}

	var orderedItems []map[string]interface{}
	for _, p := range posts {
		orderedItems = append(orderedItems, map[string]interface{}{
			"id":        fmt.Sprintf("%s://%s/api/activitypub/posts/%d", scheme, host, p.ID),
			"type":      "Create",
			"actor":     fmt.Sprintf("%s://%s/api/activitypub/users/%d", scheme, host, p.UserID),
			"published": p.CreatedAt.Format(http.TimeFormat),
			"object": map[string]interface{}{
				"id":           fmt.Sprintf("%s://%s/api/activitypub/posts/%d/note", scheme, host, p.ID),
				"type":         "Note",
				"attributedTo": fmt.Sprintf("%s://%s/api/activitypub/users/%d", scheme, host, p.UserID),
				"content":      p.Content,
				"signature":    p.Signature,
			},
		})
	}

	w.Header().Set("Content-Type", "application/activity+json; charset=utf-8")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"@context":     "https://www.w3.org/ns/activitystreams",
		"id":           fmt.Sprintf("%s://%s/api/activitypub/outbox", scheme, host),
		"type":         "OrderedCollection",
		"totalItems":   len(orderedItems),
		"orderedItems": orderedItems,
	})
}

// ResolveUserDID резолвит канонический W3C Decentralized Identifier (DID) документ пользователя.
// GET /api/did/users/{id}
func (h *Handler) ResolveUserDID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid URL path"})
		return
	}
	userID, err := strconv.Atoi(parts[3])
	if err != nil || userID <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid user ID"})
		return
	}

	h.generateDIDDocument(w, r, userID)
}

// ResolveDID резолвит DID по строке did:gosocial:...
// GET /api/did/{did}
func (h *Handler) ResolveDID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid DID string"})
		return
	}
	didStr := parts[2]

	userID := 1
	if strings.Contains(didStr, "user:") {
		uidPart := strings.TrimPrefix(didStr, "did:gosocial:user:")
		if id, err := strconv.Atoi(uidPart); err == nil && id > 0 {
			userID = id
		}
	}

	h.generateDIDDocument(w, r, userID)
}

func (h *Handler) generateDIDDocument(w http.ResponseWriter, r *http.Request, userID int) {
	user, err := h.userRepo.GetByID(userID, 0)
	if err != nil || user == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "DID entity not found"})
		return
	}

	var ed25519Key, x25519Key string
	if h.cryptoRepo != nil {
		keys, err := h.cryptoRepo.GetKeys(userID)
		if err == nil && keys != nil {
			ed25519Key = keys.PublicKeyEd25519
			x25519Key = keys.PublicKeyX25519
		}
	}
	if ed25519Key == "" {
		ed25519Key = base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("ed25519_seed_key_for_user_%d", userID)))
	}
	if x25519Key == "" {
		x25519Key = base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("x25519_ecdh_key_for_user_%d", userID)))
	}

	didID := fmt.Sprintf("did:gosocial:user:%d", userID)
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost:8080"
	}

	w.Header().Set("Content-Type", "application/did+ld+json; charset=utf-8")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"@context": []string{
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/ed25519-2020/v1",
			"https://w3id.org/security/suites/x25519-2020/v1",
		},
		"id": didID,
		"alsoKnownAs": []string{
			fmt.Sprintf("acct:%s@%s", user.Username, host),
			fmt.Sprintf("%s://%s/api/activitypub/users/%d", scheme, host, user.ID),
		},
		"verificationMethod": []map[string]interface{}{
			{
				"id":           fmt.Sprintf("%s#ed25519-key-1", didID),
				"type":         "Ed25519VerificationKey2020",
				"controller":   didID,
				"publicKeyHex": ed25519Key,
			},
			{
				"id":           fmt.Sprintf("%s#x25519-key-1", didID),
				"type":         "X25519KeyAgreementKey2020",
				"controller":   didID,
				"publicKeyHex": x25519Key,
			},
		},
		"authentication": []string{
			fmt.Sprintf("%s#ed25519-key-1", didID),
		},
		"assertionMethod": []string{
			fmt.Sprintf("%s#ed25519-key-1", didID),
		},
		"keyAgreement": []string{
			fmt.Sprintf("%s#x25519-key-1", didID),
		},
		"service": []map[string]interface{}{
			{
				"id":              fmt.Sprintf("%s#inbox", didID),
				"type":            "ActivityPubInbox",
				"serviceEndpoint": fmt.Sprintf("%s://%s/api/activitypub/inbox", scheme, host),
			},
			{
				"id":              fmt.Sprintf("%s#outbox", didID),
				"type":            "ActivityPubOutbox",
				"serviceEndpoint": fmt.Sprintf("%s://%s/api/activitypub/outbox", scheme, host),
			},
		},
	})
}
