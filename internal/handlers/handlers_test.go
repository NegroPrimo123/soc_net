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
	"social-network/internal/database"
	"social-network/internal/events"
	"social-network/internal/handlers"
	"social-network/internal/models"
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
	hub := events.NewHub()

	h, err := handlers.NewHandler(userRepo, postRepo, giftRepo, messageRepo, notifRepo, channelRepo, pollRepo, hub)
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
	post, err := postRepo.CreatePost(1, "Пост автора Олег для проверки прав", "", "", "", "", nil, nil)
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
