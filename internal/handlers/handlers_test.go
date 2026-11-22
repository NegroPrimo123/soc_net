package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"social-network/internal/config"
	"social-network/internal/crypto"
	"social-network/internal/database"
	"social-network/internal/events"
	"social-network/internal/federation"
	"social-network/internal/graph"
	"social-network/internal/handlers"
	"social-network/internal/models"
	"social-network/internal/ranking"
	"social-network/internal/repository"
)

func setupTestApp(t *testing.T) (*http.ServeMux, *repository.UserRepository, *repository.PostRepository, *repository.MessageRepository, *repository.NotificationRepository, string, string) {
	cfg := config.Load()
	db, err := database.InitDB(cfg)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	userRepo := repository.NewUserRepository(db)
	postRepo := repository.NewPostRepository(db)
	giftRepo := repository.NewGiftRepository(db)
	messageRepo := repository.NewMessageRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	channelRepo := repository.NewChannelRepository(db)
	pollRepo := repository.NewPollRepository(db)
	achievementRepo := repository.NewAchievementRepository(db)
	cryptoRepo := repository.NewCryptoRepository(db)
	federationRepo := repository.NewFederationRepository(db)
	socialGraph := graph.NewGraph()
	_ = socialGraph.BuildFromDB(db)
	rankingEngine := ranking.NewEngine(socialGraph)
	federationSvc := federation.NewService("test-node", "http://localhost:8080")
	hub := events.NewHub()

	h, err := handlers.NewHandler(
		userRepo, postRepo, giftRepo, messageRepo, notifRepo, channelRepo, pollRepo, achievementRepo,
		cryptoRepo, federationRepo, socialGraph, rankingEngine, federationSvc, hub,
	)
	if err != nil {
		t.Fatalf("Failed to initialize handler: %v", err)
	}

	mux := http.NewServeMux()
	handlers.RegisterRoutes(mux, h)

	// Create test sessions
	tokenUser1, err := userRepo.CreateSession(1) // Oleg
	if err != nil {
		t.Fatalf("Failed to create session for user 1: %v", err)
	}

	tokenUser2, err := userRepo.CreateSession(2) // Alex
	if err != nil {
		t.Fatalf("Failed to create session for user 2: %v", err)
	}

	return mux, userRepo, postRepo, messageRepo, notifRepo, tokenUser1, tokenUser2
}

// 1. Проверка 401 Unauthorized при обращении к защищенным эндпоинтам без токена
func TestUnauthorizedWithoutToken(t *testing.T) {
	mux, _, _, _, _, _, _ := setupTestApp(t)

	tests := []struct {
		name       string
		method     string
		url        string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "POST /api/posts без токена -> 401 Unauthorized",
			method:     "POST",
			url:        "/api/posts",
			body:       models.CreatePostRequest{Content: "Пост без авторизации"},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "POST /api/messages без токена -> 401 Unauthorized",
			method:     "POST",
			url:        "/api/messages",
			body:       models.SendMessageRequest{ReceiverID: 2, Content: "Сообщение без токена"},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "GET /api/auth/me без токена -> 401 Unauthorized",
			method:     "GET",
			url:        "/api/auth/me",
			body:       nil,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "POST /api/gifts без токена -> 401 Unauthorized",
			method:     "POST",
			url:        "/api/gifts",
			body:       models.SendGiftRequest{ReceiverID: 2, GiftType: "festive_box"},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "GET /api/messages/conversations без токена -> 401 Unauthorized",
			method:     "GET",
			url:        "/api/messages/conversations",
			body:       nil,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "DELETE /api/posts/1 без токена -> 401 Unauthorized",
			method:     "DELETE",
			url:        "/api/posts/1",
			body:       nil,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "GET /api/notifications без токена -> 401 Unauthorized",
			method:     "GET",
			url:        "/api/notifications",
			body:       nil,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "POST /api/upload без токена -> 401 Unauthorized",
			method:     "POST",
			url:        "/api/upload",
			body:       nil,
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			if tt.body != nil {
				bodyBytes, _ = json.Marshal(tt.body)
			}
			req := httptest.NewRequest(tt.method, tt.url, bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			mux.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("[%s] Expected status %d, got %d. Body: %s", tt.name, tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// 2. Проверка 403 Forbidden при попытке изменения или удаления чужого ресурса
func TestForbiddenOnForeignResource(t *testing.T) {
	mux, _, postRepo, _, _, _, tokenUser2 := setupTestApp(t)

	// Создаем тестовый пост от имени Пользователя 1 (Олег)
	post, err := postRepo.CreatePost(1, "Пост автора Олег для проверки прав", "", "", "", "", nil, nil, "", "", false)
	if err != nil {
		t.Fatalf("Failed to create post: %v", err)
	}
	defer postRepo.DeletePost(post.ID, 1)

	t.Run("Пользователь 2 пытается удалить чужой пост -> 403 Forbidden", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/posts/"+strconvItoa(post.ID), nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Пользователь 2 пытается отредактировать чужой пост -> 403 Forbidden", func(t *testing.T) {
		body, _ := json.Marshal(models.UpdatePostRequest{
			UserID:  2,
			Content: "Попытка взлома чужого поста",
		})
		req := httptest.NewRequest("PUT", "/api/posts/"+strconvItoa(post.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

// 3. Проверка успешных авторизованных операций (200 OK / 201 Created)
func TestAuthorizedOperations(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	var createdPostID int

	t.Run("Создание поста владельцем -> 201 Created", func(t *testing.T) {
		body, _ := json.Marshal(models.CreatePostRequest{
			UserID:   1,
			Content:  "Новый легитимный пост от автора Олег",
			ImageURL: "",
		})
		req := httptest.NewRequest("POST", "/api/posts", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}

		var created models.Post
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("Failed to parse created post: %v", err)
		}
		createdPostID = created.ID
	})

	t.Run("Редактирование своего поста -> 200 OK", func(t *testing.T) {
		body, _ := json.Marshal(models.UpdatePostRequest{
			UserID:  1,
			Content: "Обновленный текст своего поста",
		})
		req := httptest.NewRequest("PUT", "/api/posts/"+strconvItoa(createdPostID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Удаление своего поста -> 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/posts/"+strconvItoa(createdPostID), nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

// 4. Проверка API Личных сообщений (Direct Messages)
func TestDirectMessagesAPI(t *testing.T) {
	mux, userRepo, _, _, _, tokenUser1, tokenUser2 := setupTestApp(t)

	t.Run("Отправка сообщения между пользователями -> 201 Created", func(t *testing.T) {
		body, _ := json.Marshal(models.SendMessageRequest{
			ReceiverID: 2,
			Content:    "Привет, Алексей! Тестируем личные сообщения.",
		})
		req := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Попытка отправить сообщение самому себе -> 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(models.SendMessageRequest{
			ReceiverID: 1,
			Content:    "Сообщение себе",
		})
		req := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("Получение переписки авторизованным пользователем -> 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/messages/1", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Получение списка диалогов -> 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/messages/conversations", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Пользователь C не может прочитать чужую переписку A и B -> пустой ответ или 403 Forbidden", func(t *testing.T) {
		tokenUser3, err := userRepo.CreateSession(3)
		if err != nil {
			t.Fatalf("Failed to create session for user 3: %v", err)
		}

		// 1. Пользователь 1 (A) отправляет секретное сообщение пользователю 2 (B)
		secretContent := "Секретный ключ авторизации шлюза: X-SECRET-994"
		sendPayload, _ := json.Marshal(models.SendMessageRequest{
			ReceiverID: 2,
			Content:    secretContent,
		})
		reqSend := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(sendPayload))
		reqSend.Header.Set("Content-Type", "application/json")
		reqSend.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		wSend := httptest.NewRecorder()
		mux.ServeHTTP(wSend, reqSend)
		if wSend.Code != http.StatusCreated {
			t.Fatalf("Failed to send message: %d", wSend.Code)
		}

		// 2. Пользователь C (tokenUser3) запрашивает переписку с пользователем 2 (B)
		// Пользователь C не является участником переписки A и B, поэтому в ответе 0 сообщений
		reqC := httptest.NewRequest("GET", "/api/messages/2", nil)
		reqC.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser3})
		wC := httptest.NewRecorder()
		mux.ServeHTTP(wC, reqC)

		if wC.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for C's own conversation with B, got %d", wC.Code)
		}

		var msgsC []models.Message
		if err := json.Unmarshal(wC.Body.Bytes(), &msgsC); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}
		if len(msgsC) != 0 {
			t.Errorf("User C received %d messages, expected 0 (conversation isolation violation)", len(msgsC))
		}
		if strings.Contains(wC.Body.String(), secretContent) {
			t.Fatalf("CRITICAL SECURITY VIOLATION: Secret message between A and B leaked to user C!")
		}

		// 3. Пользователь C пытается явно запросить диалог между A и B через ?user1=1&user2=2 -> 403 Forbidden
		reqForbidden := httptest.NewRequest("GET", "/api/messages/2?user1=1&user2=2", nil)
		reqForbidden.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser3})
		wForbidden := httptest.NewRecorder()
		mux.ServeHTTP(wForbidden, reqForbidden)

		if wForbidden.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden when C attempts to access conversation between A and B, got %d", wForbidden.Code)
		}
	})
}

// 5. Проверка системы уведомлений с умной группировкой
func TestNotificationsSystem(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	t.Run("Получение сгруппированных уведомлений -> 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/notifications", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}

		var notifs []models.GroupedNotification
		if err := json.Unmarshal(w.Body.Bytes(), &notifs); err != nil {
			t.Fatalf("Failed to parse notifications: %v", err)
		}
	})

	t.Run("Получение счетчика непрочитанных уведомлений -> 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/notifications/unread", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

// 6. Проверка загрузки файлов с диска (Multipart File Upload)
func TestFileUpload(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	t.Run("Успешная загрузка изображения с диска -> 201 Created", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "test_photo.png")
		if err != nil {
			t.Fatalf("CreateFormFile failed: %v", err)
		}
		part.Write([]byte("\x89PNG\r\n\x1a\nFake PNG binary payload"))
		writer.Close()

		req := httptest.NewRequest("POST", "/api/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("Failed to parse JSON response: %v", err)
		}
		if url, ok := res["url"].(string); !ok || len(url) == 0 {
			t.Fatalf("Expected non-empty 'url' in response, got %v", res["url"])
		}
	})

	t.Run("Попытка загрузки недопустимого формата файла (.exe) -> 400 Bad Request", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "malware.exe")
		if err != nil {
			t.Fatalf("CreateFormFile failed: %v", err)
		}
		part.Write([]byte("MZ executable binary"))
		writer.Close()

		req := httptest.NewRequest("POST", "/api/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

func strconvItoa(i int) string {
	var buf [32]byte
	curr := len(buf)
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	for i > 0 {
		curr--
		buf[curr] = byte('0' + (i % 10))
		i /= 10
	}
	if neg {
		curr--
		buf[curr] = '-'
	}
	return string(buf[curr:])
}

func TestCommentOperations(t *testing.T) {
	mux, _, _, _, _, tokenUser1, tokenUser2 := setupTestApp(t)

	// User 1 creates a post
	postPayload := `{"content": "Тестовый пост для проверки комментариев"}`
	req := httptest.NewRequest("POST", "/api/posts", strings.NewReader(postPayload))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create post: %d", w.Code)
	}
	var post models.Post
	json.Unmarshal(w.Body.Bytes(), &post)

	// User 2 comments on the post
	commentPayload := `{"content": "Первоначальный комментарий"}`
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/posts/%d/comments", post.ID), strings.NewReader(commentPayload))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create comment: %d", w.Code)
	}
	var comment models.Comment
	json.Unmarshal(w.Body.Bytes(), &comment)

	t.Run("Редактирование своего комментария автором -> 200 OK", func(t *testing.T) {
		editPayload := `{"content": "Отредактированный комментарий"}`
		reqEdit := httptest.NewRequest("PUT", fmt.Sprintf("/api/comments/%d", comment.ID), strings.NewReader(editPayload))
		reqEdit.Header.Set("Content-Type", "application/json")
		reqEdit.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		wEdit := httptest.NewRecorder()
		mux.ServeHTTP(wEdit, reqEdit)

		if wEdit.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", wEdit.Code, wEdit.Body.String())
		}
		var updated models.Comment
		json.Unmarshal(wEdit.Body.Bytes(), &updated)
		if updated.Content != "Отредактированный комментарий" {
			t.Fatalf("Expected updated content, got %s", updated.Content)
		}
		if !updated.IsEdited {
			t.Fatalf("Expected IsEdited to be true")
		}
	})

	t.Run("Попытка чужого пользователя отредактировать комментарий -> 403 Forbidden", func(t *testing.T) {
		editPayload := `{"content": "Взлом комментария"}`
		reqEdit := httptest.NewRequest("PUT", fmt.Sprintf("/api/comments/%d", comment.ID), strings.NewReader(editPayload))
		reqEdit.Header.Set("Content-Type", "application/json")
		reqEdit.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		wEdit := httptest.NewRecorder()
		mux.ServeHTTP(wEdit, reqEdit)

		if wEdit.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d", wEdit.Code)
		}
	})

	t.Run("Удаление комментария автором -> 200 OK", func(t *testing.T) {
		reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/comments/%d", comment.ID), nil)
		reqDel.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		wDel := httptest.NewRecorder()
		mux.ServeHTTP(wDel, reqDel)

		if wDel.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", wDel.Code, wDel.Body.String())
		}
	})
}

func TestMessageEditAndDeleteOperations(t *testing.T) {
	mux, _, _, _, _, tokenUser1, tokenUser2 := setupTestApp(t)

	// User 1 sends message to User 2
	msgPayload := `{"receiver_id": 2, "content": "Сообщение для редактирования и удаления"}`
	req := httptest.NewRequest("POST", "/api/messages", strings.NewReader(msgPayload))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to send message: %d", w.Code)
	}
	var msg models.Message
	json.Unmarshal(w.Body.Bytes(), &msg)

	t.Run("Редактирование своего сообщения отправителем -> 200 OK", func(t *testing.T) {
		editPayload := `{"content": "Исправленный текст сообщения"}`
		reqEdit := httptest.NewRequest("PUT", fmt.Sprintf("/api/messages/%d", msg.ID), strings.NewReader(editPayload))
		reqEdit.Header.Set("Content-Type", "application/json")
		reqEdit.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		wEdit := httptest.NewRecorder()
		mux.ServeHTTP(wEdit, reqEdit)

		if wEdit.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", wEdit.Code, wEdit.Body.String())
		}
		var updated models.Message
		json.Unmarshal(wEdit.Body.Bytes(), &updated)
		if updated.Content != "Исправленный текст сообщения" {
			t.Fatalf("Expected updated content, got %s", updated.Content)
		}
		if !updated.IsEdited {
			t.Fatalf("Expected IsEdited to be true")
		}
	})

	t.Run("Попытка получателя отредактировать входящее сообщение -> 403 Forbidden", func(t *testing.T) {
		editPayload := `{"content": "Подделка сообщения"}`
		reqEdit := httptest.NewRequest("PUT", fmt.Sprintf("/api/messages/%d", msg.ID), strings.NewReader(editPayload))
		reqEdit.Header.Set("Content-Type", "application/json")
		reqEdit.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		wEdit := httptest.NewRecorder()
		mux.ServeHTTP(wEdit, reqEdit)

		if wEdit.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d", wEdit.Code)
		}
	})

	t.Run("Удаление сообщения только у себя -> 200 OK", func(t *testing.T) {
		// User 2 deletes incoming message for self
		reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/messages/%d?for_everyone=false", msg.ID), nil)
		reqDel.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		wDel := httptest.NewRecorder()
		mux.ServeHTTP(wDel, reqDel)

		if wDel.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", wDel.Code, wDel.Body.String())
		}

		// User 2 checks conversation -> msg is NOT present
		reqGet2 := httptest.NewRequest("GET", "/api/messages/1", nil)
		reqGet2.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
		wGet2 := httptest.NewRecorder()
		mux.ServeHTTP(wGet2, reqGet2)
		var list2 []models.Message
		json.Unmarshal(wGet2.Body.Bytes(), &list2)
		for _, m := range list2 {
			if m.ID == msg.ID {
				t.Fatalf("Message should be deleted for user 2")
			}
		}

		// User 1 still sees the message
		reqGet1 := httptest.NewRequest("GET", "/api/messages/2", nil)
		reqGet1.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		wGet1 := httptest.NewRecorder()
		mux.ServeHTTP(wGet1, reqGet1)
		var list1 []models.Message
		json.Unmarshal(wGet1.Body.Bytes(), &list1)
		found := false
		for _, m := range list1 {
			if m.ID == msg.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Message should still be visible for user 1")
		}
	})

	t.Run("Групповое удаление сообщений (Batch Delete) -> 200 OK", func(t *testing.T) {
		// Send 2 more messages from 1 to 2
		m1Payload := `{"receiver_id": 2, "content": "Пакетное 1"}`
		req1 := httptest.NewRequest("POST", "/api/messages", strings.NewReader(m1Payload))
		req1.Header.Set("Content-Type", "application/json")
		req1.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w1 := httptest.NewRecorder()
		mux.ServeHTTP(w1, req1)
		var m1 models.Message
		json.Unmarshal(w1.Body.Bytes(), &m1)

		m2Payload := `{"receiver_id": 2, "content": "Пакетное 2"}`
		req2 := httptest.NewRequest("POST", "/api/messages", strings.NewReader(m2Payload))
		req2.Header.Set("Content-Type", "application/json")
		req2.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w2 := httptest.NewRecorder()
		mux.ServeHTTP(w2, req2)
		var m2 models.Message
		json.Unmarshal(w2.Body.Bytes(), &m2)

		batchPayload := fmt.Sprintf(`{"message_ids": [%d, %d], "for_everyone": true}`, m1.ID, m2.ID)
		reqBatch := httptest.NewRequest("POST", "/api/messages/batch-delete", strings.NewReader(batchPayload))
		reqBatch.Header.Set("Content-Type", "application/json")
		reqBatch.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		wBatch := httptest.NewRecorder()
		mux.ServeHTTP(wBatch, reqBatch)

		if wBatch.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d. Body: %s", wBatch.Code, wBatch.Body.String())
		}
	})
}

// 9. Тест на изоляцию переписки: пользователь C не видит диалог A-B (403 Forbidden или пустой список)
func TestDirectMessagePrivacyAndIsolationUserC(t *testing.T) {
	mux, userRepo, _, _, _, tokenUser1, _ := setupTestApp(t)

	// Пользователь 3 (User C - сторонняя третья сторона)
	tokenUser3, err := userRepo.CreateSession(3)
	if err != nil {
		t.Fatalf("Failed to create session for user 3 (User C): %v", err)
	}

	secretMessage := "TOP_SECRET_PAYLOAD_ABC_7788: Конфиденциальный финансовый отчет A и B"

	t.Run("Этап 1: Пользователь A (id=1) отправляет секретное сообщение пользователю B (id=2)", func(t *testing.T) {
		body, _ := json.Marshal(models.SendMessageRequest{
			ReceiverID: 2,
			Content:    secretMessage,
		})
		req := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}
		t.Logf("✓ [УСПЕХ] Пользователь A успешно отправил секретное сообщение пользователю B (код 201 Created)")
	})

	t.Run("Этап 2: Пользователь C запрашивает переписку с B (GET /api/messages/2) -> Ожидание: пустой список [] (0 сообщений), утечки нет", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/messages/2", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser3})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var msgs []models.Message
		if err := json.Unmarshal(w.Body.Bytes(), &msgs); err != nil {
			t.Fatalf("JSON decode error: %v", err)
		}

		if len(msgs) != 0 {
			t.Fatalf("НАРУШЕНИЕ ИЗОЛЯЦИИ: Пользователь C получил %d сообщений между A и B!", len(msgs))
		}
		if strings.Contains(w.Body.String(), secretMessage) {
			t.Fatalf("КРИТИЧЕСКАЯ УТЕЧКА ДАННЫХ: Текст приватного сообщения обнаружен в ответе для C!")
		}
		t.Logf("✓ [УСПЕХ] Пользователь C получил пустой список диалога с B (длина: %d, статус: %d OK). Утечки приватных данных A-B нет.", len(msgs), w.Code)
	})

	t.Run("Этап 3: Пользователь C пытается принудительно перехватить диалог A-B (GET /api/messages/2?user1=1&user2=2) -> Ожидание: 403 Forbidden", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/messages/2?user1=1&user2=2", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser3})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("ОШИБКА БЕЗОПАСНОСТИ: Ожидался статус 403 Forbidden при попытке перехвата, получен %d", w.Code)
		}

		var errResp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &errResp)
		t.Logf("✓ [УСПЕХ] Сервер заблокировал несанкционированный запрос C к чужому диалогу A-B. Статус: 403 Forbidden, ответ: %s", errResp["error"])
	})

	t.Run("Этап 4: Пользователь C запрашивает список своих диалогов (GET /api/messages/conversations) -> Ожидание: диалог с B отсутствует, секретное сообщение A-B не утекает", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/messages/conversations", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser3})
		w := httptest.NewRecorder()

		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var convs []models.Conversation
		if err := json.Unmarshal(w.Body.Bytes(), &convs); err != nil {
			t.Fatalf("JSON decode error: %v", err)
		}

		for _, c := range convs {
			if c.User.ID == 2 {
				t.Fatalf("НАРУШЕНИЕ ПРИВАТНОСТИ: Диалог с пользователем B (id=2) появился у стороннего пользователя C!")
			}
			if strings.Contains(c.LastMessage.Content, secretMessage) {
				t.Fatalf("КРИТИЧЕСКАЯ УТЕЧКА: Секретное сообщение A-B попало в последнее сообщение диалога для C!")
			}
		}
		t.Logf("✓ [УСПЕХ] В списке диалогов пользователя C отсутствует переписка с B (id=2), секретное сообщение A-B не скомпрометировано (диалогов C: %d)", len(convs))
	})
}

// 7. Тестирование криптографического протокола: Регистрация ключей, E2EE и подпись постов Ed25519
func TestCryptoProtocolAndVerifiablePosts(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	// 1. Получение существующих ключей пользователя 1
	reqGet := httptest.NewRequest("GET", "/api/crypto/keys/1", nil)
	wGet := httptest.NewRecorder()
	mux.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for GET /api/crypto/keys/1, got %d", wGet.Code)
	}

	// 2. Регистрация новой ключевой пары через POST /api/crypto/keys
	pubEd, privEd, err := crypto.GenerateEd25519KeyPair()
	if err != nil {
		t.Fatalf("failed to generate ed25519 key: %v", err)
	}
	pubX, _, err := crypto.GenerateX25519KeyPair()
	if err != nil {
		t.Fatalf("failed to generate x25519 key: %v", err)
	}
	fp := crypto.ComputeFingerprint(pubEd)

	regBody, _ := json.Marshal(models.RegisterKeysRequest{
		PublicKeyEd25519: pubEd,
		PublicKeyX25519:  pubX,
		KeyFingerprint:   fp,
	})
	reqReg := httptest.NewRequest("POST", "/api/crypto/keys", bytes.NewReader(regBody))
	reqReg.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wReg := httptest.NewRecorder()
	mux.ServeHTTP(wReg, reqReg)
	if wReg.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for register keys, got %d: %s", wReg.Code, wReg.Body.String())
	}
	t.Logf("✓ [УСПЕХ] Ключи Ed25519 и X25519 успешно зарегистрированы. Fingerprint: %s", fp)

	// 3. Создание криптографически подписанного поста Ed25519
	postContent := "Криптографически подписанный манифест децентрализации 2077"
	contentHash := crypto.ComputePostContentHash(1, postContent, "", "", nil, nil)
	sig, err := crypto.SignMessage(privEd, contentHash)
	if err != nil {
		t.Fatalf("failed to sign post content: %v", err)
	}

	createPostReq, _ := json.Marshal(models.CreatePostRequest{
		Content:      postContent,
		Signature:    sig,
		AuthorPubKey: pubEd,
	})
	reqPost := httptest.NewRequest("POST", "/api/posts", bytes.NewReader(createPostReq))
	reqPost.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wPost := httptest.NewRecorder()
	mux.ServeHTTP(wPost, reqPost)
	if wPost.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for signed post, got %d: %s", wPost.Code, wPost.Body.String())
	}

	var createdPost models.Post
	_ = json.Unmarshal(wPost.Body.Bytes(), &createdPost)
	if !createdPost.IsVerified {
		t.Fatalf("Expected post to be marked as is_verified=true upon creation with valid signature")
	}
	t.Logf("✓ [УСПЕХ] Пост #%d создан и успешно криптографически верифицирован на сервере (is_verified: true)", createdPost.ID)

	// 4. Проверка эндпоинта валидации подписи /api/crypto/verify-post
	verifyReq, _ := json.Marshal(models.VerifyPostSignatureRequest{
		PostID:       createdPost.ID,
		Content:      postContent,
		AuthorPubKey: pubEd,
		Signature:    sig,
	})
	reqVer := httptest.NewRequest("POST", "/api/crypto/verify-post", bytes.NewReader(verifyReq))
	wVer := httptest.NewRecorder()
	mux.ServeHTTP(wVer, reqVer)
	if wVer.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for verify-post, got %d", wVer.Code)
	}

	var verResp models.VerifySignatureResponse
	_ = json.Unmarshal(wVer.Body.Bytes(), &verResp)
	if !verResp.IsValid {
		t.Fatalf("Verification API returned is_valid=false for valid post signature")
	}
	t.Logf("✓ [УСПЕХ] API валидации подписи подтвердило аутентичность (Алгоритм: %s, Отпечаток: %s)", verResp.Algorithm, verResp.SignerFingerprint)
}

// 8. Тестирование социального графа: Степени разделения (рукопожатия) и рекомендации связей
func TestSocialGraphAndHandshakes(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	// 1. Топология графа связей /api/graph/topology
	reqTop := httptest.NewRequest("GET", "/api/graph/topology?limit=20", nil)
	reqTop.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wTop := httptest.NewRecorder()
	mux.ServeHTTP(wTop, reqTop)
	if wTop.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/graph/topology, got %d", wTop.Code)
	}

	var topResp map[string]interface{}
	_ = json.Unmarshal(wTop.Body.Bytes(), &topResp)
	nodes, _ := topResp["nodes"].([]interface{})
	edges, _ := topResp["edges"].([]interface{})
	if len(nodes) == 0 {
		t.Fatalf("Social graph topology returned 0 nodes")
	}
	t.Logf("✓ [УСПЕХ] Топология графа связей загружена: %d узлов, %d ребер", len(nodes), len(edges))

	// 2. Расчет цепочки рукопожатий /api/graph/path/2 (Олег -> Алексей)
	reqPath := httptest.NewRequest("GET", "/api/graph/path/2", nil)
	reqPath.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wPath := httptest.NewRecorder()
	mux.ServeHTTP(wPath, reqPath)
	if wPath.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/graph/path/2, got %d", wPath.Code)
	}

	var pathResp models.DegreesOfSeparationResponse
	_ = json.Unmarshal(wPath.Body.Bytes(), &pathResp)
	if pathResp.Degree < 0 {
		t.Fatalf("Degrees of separation failed, returned negative degree: %d", pathResp.Degree)
	}
	t.Logf("✓ [УСПЕХ] Степени разделения рассчитаны: степень %d (%s)", pathResp.Degree, pathResp.PathDescription)

	// 3. Графовые рекомендации кандидатов /api/graph/recommendations
	reqRec := httptest.NewRequest("GET", "/api/graph/recommendations?limit=5", nil)
	reqRec.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wRec := httptest.NewRecorder()
	mux.ServeHTTP(wRec, reqRec)
	if wRec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/graph/recommendations, got %d", wRec.Code)
	}
	t.Logf("✓ [УСПЕХ] Графовые рекомендации контактов (Adamic-Adar) успешно сгенерированы")
}

// 9. Тестирование персонализированного ранжирования (Smart Feed & Explain Ranking)
func TestPersonalizedRankingFeed(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	// 1. Запрос умной персонализированной ленты /api/feed/ranked
	reqFeed := httptest.NewRequest("GET", "/api/feed/ranked?limit=10", nil)
	reqFeed.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wFeed := httptest.NewRecorder()
	mux.ServeHTTP(wFeed, reqFeed)
	if wFeed.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/feed/ranked, got %d", wFeed.Code)
	}

	var rankedPosts []models.Post
	if err := json.Unmarshal(wFeed.Body.Bytes(), &rankedPosts); err != nil {
		t.Fatalf("Failed to parse ranked posts: %v", err)
	}

	if len(rankedPosts) == 0 {
		t.Fatalf("Expected ranked posts, got 0")
	}

	topPost := rankedPosts[0]
	if topPost.RankingFactors == nil {
		t.Fatalf("Expected ranking_factors object attached to ranked post #%d", topPost.ID)
	}
	t.Logf("✓ [УСПЕХ] Умная лента сформирована. Топ-пост #%d (Score: %.2f, Граф: %.2f, Свежесть: %.2f)",
		topPost.ID, topPost.RankingScore, topPost.RankingFactors.GraphAffinity, topPost.RankingFactors.FreshnessScore)

	// 2. Объяснение факторов ранжирования /api/feed/ranked/explain/{id}
	explainURL := fmt.Sprintf("/api/feed/ranked/explain/%d", topPost.ID)
	reqExpl := httptest.NewRequest("GET", explainURL, nil)
	reqExpl.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wExpl := httptest.NewRecorder()
	mux.ServeHTTP(wExpl, reqExpl)
	if wExpl.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for %s, got %d", explainURL, wExpl.Code)
	}

	var explainResp map[string]interface{}
	_ = json.Unmarshal(wExpl.Body.Bytes(), &explainResp)
	if explainResp["ranking_factors"] == nil {
		t.Fatalf("Expected ranking_factors in explain response")
	}
	t.Logf("✓ [УСПЕХ] Эндпоинт Explain Ranking успешно вернул разбор математических факторов скоринга")
}

// 10. Тестирование децентрализованной федерации узлов (Peer Discovery & Protocol)
func TestDecentralizedFederationAPI(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	// 1. Получение списка известных узлов сети /api/federation/nodes
	reqNodes := httptest.NewRequest("GET", "/api/federation/nodes", nil)
	wNodes := httptest.NewRecorder()
	mux.ServeHTTP(wNodes, reqNodes)
	if wNodes.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/federation/nodes, got %d", wNodes.Code)
	}

	var nodesResp map[string]interface{}
	_ = json.Unmarshal(wNodes.Body.Bytes(), &nodesResp)
	localNode, _ := nodesResp["local_node"].(map[string]interface{})
	peers, _ := nodesResp["peers"].([]interface{})
	if localNode == nil || len(peers) == 0 {
		t.Fatalf("Expected local node and peers list, got: %v", nodesResp)
	}
	t.Logf("✓ [УСПЕХ] Децентрализованная сеть: Локальный узел '%s', обнаружено активных пиров: %d",
		localNode["node_name"], len(peers))

	// 2. Пинг федеративного пира /api/federation/ping
	pingReq, _ := json.Marshal(map[string]string{
		"node_url": "https://alpha.neonet.network",
	})
	reqPing := httptest.NewRequest("POST", "/api/federation/ping", bytes.NewReader(pingReq))
	reqPing.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wPing := httptest.NewRecorder()
	mux.ServeHTTP(wPing, reqPing)
	if wPing.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for ping, got %d", wPing.Code)
	}

	var pingResp map[string]interface{}
	_ = json.Unmarshal(wPing.Body.Bytes(), &pingResp)
	if pingResp["status"] != "online" {
		t.Fatalf("Expected peer status online, got: %v", pingResp["status"])
	}
	t.Logf("✓ [УСПЕХ] Пинг узла https://alpha.neonet.network подтвержден: %v мс", pingResp["ping_ms"])

	// 3. Федеративный Outbox /api/federation/outbox
	reqOut := httptest.NewRequest("GET", "/api/federation/outbox", nil)
	wOut := httptest.NewRecorder()
	mux.ServeHTTP(wOut, reqOut)
	if wOut.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for outbox, got %d", wOut.Code)
	}
	t.Logf("✓ [УСПЕХ] Федеративный Outbox успешно отдал публикации для синхронизации узлов сети")
}

func TestStoriesFeature(t *testing.T) {
	mux, _, _, _, _, tokenUser1, tokenUser2 := setupTestApp(t)

	// 1. Создание истории пользователем 1
	createStoryBody, _ := json.Marshal(map[string]string{
		"media_url":   "/uploads/test_story.png",
		"caption":     "Тестовая история в Найт-Сити ⚡",
		"bg_gradient": "linear-gradient(135deg, #091e3a, #00f0ff)",
	})
	reqCreate := httptest.NewRequest("POST", "/api/stories", bytes.NewReader(createStoryBody))
	reqCreate.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wCreate := httptest.NewRecorder()
	mux.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for story, got %d: %s", wCreate.Code, wCreate.Body.String())
	}

	var createdStory models.Story
	_ = json.Unmarshal(wCreate.Body.Bytes(), &createdStory)
	if createdStory.ID == 0 || createdStory.Caption != "Тестовая история в Найт-Сити ⚡" {
		t.Fatalf("Unexpected created story: %+v", createdStory)
	}
	t.Logf("✓ [УСПЕХ] Создана временная история ID=%d", createdStory.ID)

	// 2. Получение активных историй
	reqList := httptest.NewRequest("GET", "/api/stories", nil)
	reqList.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
	wList := httptest.NewRecorder()
	mux.ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/stories, got %d", wList.Code)
	}

	var groups []models.StoryGroup
	_ = json.Unmarshal(wList.Body.Bytes(), &groups)
	if len(groups) == 0 {
		t.Fatalf("Expected at least 1 story group, got 0")
	}
	t.Logf("✓ [УСПЕХ] Получено активных групп историй: %d", len(groups))

	// 3. Отметка о просмотре пользователем 2
	reqView := httptest.NewRequest("POST", fmt.Sprintf("/api/stories/%d/view", createdStory.ID), nil)
	reqView.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
	wView := httptest.NewRecorder()
	mux.ServeHTTP(wView, reqView)
	if wView.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for story view, got %d: %s", wView.Code, wView.Body.String())
	}

	// 4. Проверка просмотров автором (пользователем 1)
	reqDetail := httptest.NewRequest("GET", fmt.Sprintf("/api/stories/%d", createdStory.ID), nil)
	reqDetail.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wDetail := httptest.NewRecorder()
	mux.ServeHTTP(wDetail, reqDetail)
	if wDetail.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for story detail, got %d", wDetail.Code)
	}

	var detail models.Story
	_ = json.Unmarshal(wDetail.Body.Bytes(), &detail)
	if detail.ViewsCount < 1 {
		t.Fatalf("Expected views count >= 1, got %d", detail.ViewsCount)
	}
	t.Logf("✓ [УСПЕХ] Просмотр истории зафиксирован: %d просмотров", detail.ViewsCount)

	// 5. Удаление истории
	reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/stories/%d", createdStory.ID), nil)
	reqDel.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wDel := httptest.NewRecorder()
	mux.ServeHTTP(wDel, reqDel)
	if wDel.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for story delete, got %d", wDel.Code)
	}
	t.Logf("✓ [УСПЕХ] История успешно удалена автором")
}

func TestBlacklistFeature(t *testing.T) {
	mux, _, _, _, _, tokenUser1, tokenUser2 := setupTestApp(t)

	// 1. Блокировка пользователя 2 пользователем 1
	blockBody, _ := json.Marshal(map[string]int{"user_id": 2})
	reqBlock := httptest.NewRequest("POST", "/api/blacklist", bytes.NewReader(blockBody))
	reqBlock.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wBlock := httptest.NewRecorder()
	mux.ServeHTTP(wBlock, reqBlock)
	if wBlock.Code != http.StatusCreated && wBlock.Code != http.StatusOK {
		t.Fatalf("Expected 200/201 for block, got %d: %s", wBlock.Code, wBlock.Body.String())
	}
	t.Logf("✓ [УСПЕХ] Пользователь 2 добавлен в черный список пользователя 1")

	// 2. Проверка статуса блокировки
	reqStatus := httptest.NewRequest("GET", "/api/users/2/block-status", nil)
	reqStatus.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wStatus := httptest.NewRecorder()
	mux.ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for block-status, got %d", wStatus.Code)
	}

	var statusResp map[string]interface{}
	_ = json.Unmarshal(wStatus.Body.Bytes(), &statusResp)
	if statusResp["is_blocked_by_me"] != true || statusResp["is_blocked"] != true {
		t.Fatalf("Expected is_blocked_by_me=true, got %v", statusResp)
	}
	t.Logf("✓ [УСПЕХ] Статус блокировки подтвержден: %v", statusResp)

	// 3. Попытка пользователя 2 отправить личное сообщение пользователю 1 (должно быть 403 Forbidden)
	msgBody, _ := json.Marshal(map[string]interface{}{
		"receiver_id": 1,
		"content":     "Привет, это запрещенное сообщение",
	})
	reqMsg := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(msgBody))
	reqMsg.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser2})
	wMsg := httptest.NewRecorder()
	mux.ServeHTTP(wMsg, reqMsg)
	if wMsg.Code != http.StatusBadRequest && wMsg.Code != http.StatusForbidden {
		t.Fatalf("Expected blocked error for message to user who blocked, got %d: %s", wMsg.Code, wMsg.Body.String())
	}
	t.Logf("✓ [УСПЕХ] Отправка сообщения заблокирована (код %d)", wMsg.Code)

	// 4. Разблокировка пользователя 2
	reqUnblock := httptest.NewRequest("DELETE", "/api/blacklist/2", nil)
	reqUnblock.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wUnblock := httptest.NewRecorder()
	mux.ServeHTTP(wUnblock, reqUnblock)
	if wUnblock.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for unblock, got %d: %s", wUnblock.Code, wUnblock.Body.String())
	}
	t.Logf("✓ [УСПЕХ] Пользователь 2 успешно разблокирован")
}

func TestScheduledHiddenEphemeralMessages(t *testing.T) {
	mux, _, _, _, _, tokenUser1, _ := setupTestApp(t)

	// 1. Отложенное сообщение (Scheduled in future)
	futureTime := "2030-01-01T12:00:00Z"
	schedBody, _ := json.Marshal(map[string]interface{}{
		"receiver_id":  2,
		"content":      "Отложенное квантовое сообщение в 2030 год",
		"scheduled_at": futureTime,
	})
	reqSched := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(schedBody))
	reqSched.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wSched := httptest.NewRecorder()
	mux.ServeHTTP(wSched, reqSched)
	if wSched.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for scheduled message, got %d: %s", wSched.Code, wSched.Body.String())
	}

	// Проверяем очередь отложенных сообщений
	reqQueue := httptest.NewRequest("GET", "/api/messages/scheduled?with_user_id=2", nil)
	reqQueue.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wQueue := httptest.NewRecorder()
	mux.ServeHTTP(wQueue, reqQueue)
	if wQueue.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for scheduled queue, got %d", wQueue.Code)
	}

	var scheduledList []models.Message
	_ = json.Unmarshal(wQueue.Body.Bytes(), &scheduledList)
	if len(scheduledList) == 0 {
		t.Fatalf("Expected at least 1 scheduled message in queue, got 0")
	}
	t.Logf("✓ [УСПЕХ] Отложенное сообщение находится в очереди доставки: %s", scheduledList[0].Content)

	// 2. Скрытое сообщение (Spoiler)
	spoilerBody, _ := json.Marshal(map[string]interface{}{
		"receiver_id": 2,
		"content":     "Секретный код кибер-доступа: 9841-CYBER",
		"is_hidden":   true,
		"hidden_hint": "Секретный пароль",
	})
	reqSpoiler := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(spoilerBody))
	reqSpoiler.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wSpoiler := httptest.NewRecorder()
	mux.ServeHTTP(wSpoiler, reqSpoiler)
	if wSpoiler.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for spoiler message, got %d: %s", wSpoiler.Code, wSpoiler.Body.String())
	}

	var createdSpoiler models.Message
	_ = json.Unmarshal(wSpoiler.Body.Bytes(), &createdSpoiler)
	if !createdSpoiler.IsHidden || createdSpoiler.HiddenHint != "Секретный пароль" {
		t.Fatalf("Expected hidden message with hint, got: %+v", createdSpoiler)
	}
	t.Logf("✓ [УСПЕХ] Скрытое сообщение (спойлер) доставлено с подсказкой: '%s'", createdSpoiler.HiddenHint)

	// 3. Самоуничтожающееся сообщение (Ephemeral)
	ephemeralBody, _ := json.Marshal(map[string]interface{}{
		"receiver_id":           2,
		"content":               "Это сообщение исчезнет через 10 секунд после прочтения",
		"self_destruct_seconds": 10,
	})
	reqEph := httptest.NewRequest("POST", "/api/messages", bytes.NewReader(ephemeralBody))
	reqEph.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wEph := httptest.NewRecorder()
	mux.ServeHTTP(wEph, reqEph)
	if wEph.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for ephemeral message, got %d: %s", wEph.Code, wEph.Body.String())
	}

	var createdEph models.Message
	_ = json.Unmarshal(wEph.Body.Bytes(), &createdEph)
	if createdEph.SelfDestructSeconds != 10 {
		t.Fatalf("Expected SelfDestructSeconds=10, got %d", createdEph.SelfDestructSeconds)
	}
	t.Logf("✓ [УСПЕХ] Временное самоуничтожающееся сообщение доставлено (таймер: %d с)", createdEph.SelfDestructSeconds)
}

func TestCollectionsPinterestFeature(t *testing.T) {
	mux, _, postRepo, _, _, tokenUser1, _ := setupTestApp(t)

	// Создаем тестовый пост для сохранения в подборку
	testPost, err := postRepo.CreatePost(1, "Потрясающий неоновый арт для подборки Pinterest", "/uploads/art_cyber.jpg", "", "", "", nil, nil, "", "", false)
	if err != nil {
		t.Fatalf("Failed to create test post: %v", err)
	}

	// 1. Создание подборки (Board)
	colBody, _ := json.Marshal(map[string]interface{}{
		"title":           "Киберпанк Арт (Pinterest Board)",
		"description":     "Лучшие арты и концепты Найт-Сити",
		"cover_image_url": "/uploads/art_cyber.jpg",
		"is_private":      false,
	})
	reqCreate := httptest.NewRequest("POST", "/api/collections", bytes.NewReader(colBody))
	reqCreate.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wCreate := httptest.NewRecorder()
	mux.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for collection, got %d: %s", wCreate.Code, wCreate.Body.String())
	}

	var col models.PostCollection
	_ = json.Unmarshal(wCreate.Body.Bytes(), &col)
	if col.ID == 0 || col.Title != "Киберпанк Арт (Pinterest Board)" {
		t.Fatalf("Unexpected collection: %+v", col)
	}
	t.Logf("✓ [УСПЕХ] Создана тематическая подборка ID=%d: '%s'", col.ID, col.Title)

	// 2. Добавление поста в подборку
	addPostReq, _ := json.Marshal(map[string]int{"post_id": testPost.ID})
	reqAdd := httptest.NewRequest("POST", fmt.Sprintf("/api/collections/%d/posts", col.ID), bytes.NewReader(addPostReq))
	reqAdd.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wAdd := httptest.NewRecorder()
	mux.ServeHTTP(wAdd, reqAdd)
	if wAdd.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for add post to collection, got %d: %s", wAdd.Code, wAdd.Body.String())
	}
	t.Logf("✓ [УСПЕХ] Пост ID=%d добавлен в подборку (пин закреплен)", testPost.ID)

	// 3. Получение деталей подборки со всеми постами
	reqDetail := httptest.NewRequest("GET", fmt.Sprintf("/api/collections/%d", col.ID), nil)
	reqDetail.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wDetail := httptest.NewRecorder()
	mux.ServeHTTP(wDetail, reqDetail)
	if wDetail.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for collection detail, got %d", wDetail.Code)
	}

	var detail models.CollectionDetail
	_ = json.Unmarshal(wDetail.Body.Bytes(), &detail)
	if len(detail.Posts) != 1 || detail.Posts[0].ID != testPost.ID {
		t.Fatalf("Expected 1 post in collection detail, got: %d", len(detail.Posts))
	}
	t.Logf("✓ [УСПЕХ] Детализация доски: %d сохраненный пост", len(detail.Posts))

	// 4. Удаление поста из подборки
	reqRemove := httptest.NewRequest("DELETE", fmt.Sprintf("/api/collections/%d/posts/%d", col.ID, testPost.ID), nil)
	reqRemove.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wRemove := httptest.NewRecorder()
	mux.ServeHTTP(wRemove, reqRemove)
	if wRemove.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for remove post from collection, got %d", wRemove.Code)
	}
	t.Logf("✓ [УСПЕХ] Пост удален из подборки")

	// 5. Удаление подборки
	reqDelCol := httptest.NewRequest("DELETE", fmt.Sprintf("/api/collections/%d", col.ID), nil)
	reqDelCol.AddCookie(&http.Cookie{Name: "session_token", Value: tokenUser1})
	wDelCol := httptest.NewRecorder()
	mux.ServeHTTP(wDelCol, reqDelCol)
	if wDelCol.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for delete collection, got %d", wDelCol.Code)
	}
	t.Logf("✓ [УСПЕХ] Подборка успешно удалена")
}

