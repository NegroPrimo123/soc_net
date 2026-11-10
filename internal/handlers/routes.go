package handlers

import (
	"net/http"
)

func RegisterRoutes(mux *http.ServeMux, h *Handler) {
	// Static assets & Local file uploads with no-cache headers
	fs := http.FileServer(http.Dir("web/static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", noCacheFileServer(fs)))

	uploadsFs := http.FileServer(http.Dir("web/uploads"))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", noCacheFileServer(uploadsFs)))

	// Web pages
	mux.HandleFunc("GET /", h.Index)

	// Auth API
	mux.HandleFunc("POST /api/auth/register", h.Register)
	mux.HandleFunc("POST /api/auth/login", h.Login)
	mux.HandleFunc("POST /api/auth/logout", h.Logout)
	mux.HandleFunc("GET /api/auth/me", h.Me)

	// Feed & Posts API
	mux.HandleFunc("GET /api/feed", h.GetFeed)
	mux.HandleFunc("GET /api/posts/{id}", h.GetPost)
	mux.HandleFunc("POST /api/posts", h.CreatePost)
	mux.HandleFunc("PUT /api/posts/{id}", h.UpdatePost)
	mux.HandleFunc("POST /api/posts/{id}/edit", h.UpdatePost)
	mux.HandleFunc("DELETE /api/posts/{id}", h.DeletePost)
	mux.HandleFunc("POST /api/posts/{id}/delete", h.DeletePost)
	mux.HandleFunc("POST /api/posts/{id}/like", h.ToggleLike)
	mux.HandleFunc("POST /api/posts/{id}/comments", h.CreateComment)
	mux.HandleFunc("PUT /api/comments/{id}", h.UpdateComment)
	mux.HandleFunc("POST /api/comments/{id}/edit", h.UpdateComment)
	mux.HandleFunc("DELETE /api/comments/{id}", h.DeleteComment)
	mux.HandleFunc("POST /api/comments/{id}/delete", h.DeleteComment)

	// Users & Profile API
	mux.HandleFunc("GET /api/users", h.GetUsers)
	mux.HandleFunc("GET /api/users/{id}/profile", h.GetUserProfile)
	mux.HandleFunc("GET /api/users/{id}/gifts", h.GetUserGifts)
	mux.HandleFunc("PUT /api/users/profile", h.UpdateProfile)
	mux.HandleFunc("POST /api/users/follow", h.ToggleFollow)
	mux.HandleFunc("GET /api/users/{id}/music", h.GetUserMusic)
	mux.HandleFunc("POST /api/users/music", h.AddUserMusic)
	mux.HandleFunc("POST /api/users/music/reorder", h.ReorderUserMusic)
	mux.HandleFunc("DELETE /api/users/music/{id}", h.DeleteUserMusic)
	mux.HandleFunc("POST /api/users/music/{id}/delete", h.DeleteUserMusic)

	// Gifts API («Цветные карандаши» + сокрытие подарков)
	mux.HandleFunc("POST /api/gifts", h.SendGift)
	mux.HandleFunc("GET /api/gifts/showcase", h.GetShowcaseGifts)
	mux.HandleFunc("POST /api/gifts/{id}/toggle-hide", h.ToggleHideGift)

	// Direct Messages (Личные сообщения) API
	mux.HandleFunc("GET /api/messages/conversations", h.GetConversations)
	mux.HandleFunc("GET /api/messages/unread", h.GetUnreadMessagesCount)
	mux.HandleFunc("GET /api/messages/{userId}", h.GetMessages)
	mux.HandleFunc("POST /api/messages", h.SendMessage)
	mux.HandleFunc("PUT /api/messages/{id}", h.UpdateMessage)
	mux.HandleFunc("POST /api/messages/{id}/edit", h.UpdateMessage)
	mux.HandleFunc("DELETE /api/messages/{id}", h.DeleteMessage)
	mux.HandleFunc("POST /api/messages/{id}/delete", h.DeleteMessage)
	mux.HandleFunc("POST /api/messages/batch-delete", h.BatchDeleteMessages)
	mux.HandleFunc("POST /api/messages/{id}/reactions", h.ToggleMessageReaction)

	// Channels API (Каналы)
	mux.HandleFunc("GET /api/channels", h.ListChannels)
	mux.HandleFunc("POST /api/channels", h.CreateChannel)
	mux.HandleFunc("GET /api/channels/{id}", h.GetChannel)
	mux.HandleFunc("PUT /api/channels/{id}", h.UpdateChannel)
	mux.HandleFunc("POST /api/channels/{id}/edit", h.UpdateChannel)
	mux.HandleFunc("DELETE /api/channels/{id}", h.DeleteChannel)
	mux.HandleFunc("POST /api/channels/{id}/delete", h.DeleteChannel)
	mux.HandleFunc("POST /api/channels/{id}/subscribe", h.SubscribeChannel)
	mux.HandleFunc("POST /api/channels/{id}/unsubscribe", h.UnsubscribeChannel)
	mux.HandleFunc("GET /api/channels/{id}/posts", h.GetChannelPosts)
	mux.HandleFunc("POST /api/channels/{id}/posts", h.CreateChannelPost)
	mux.HandleFunc("GET /api/channels/{id}/conversations", h.GetChannelConversations)
	mux.HandleFunc("GET /api/user/channel-conversations", h.GetUserChannelConversations)
	mux.HandleFunc("GET /api/channels/{id}/messages", h.GetChannelMessages)
	mux.HandleFunc("POST /api/channels/{id}/messages", h.SendChannelMessage)

	// Polls & Voting API (Опросы и голосования)
	mux.HandleFunc("POST /api/polls", h.CreatePoll)
	mux.HandleFunc("GET /api/polls/{id}", h.GetPoll)
	mux.HandleFunc("POST /api/polls/{id}/vote", h.VotePoll)
	mux.HandleFunc("POST /api/polls/vote", h.VotePoll)
	mux.HandleFunc("POST /api/polls/{id}/unvote", h.UnvotePoll)
	mux.HandleFunc("POST /api/polls/unvote", h.UnvotePoll)

	// Notifications API (Умная группировка)
	mux.HandleFunc("GET /api/notifications", h.GetNotifications)
	mux.HandleFunc("POST /api/notifications/read", h.MarkNotificationsAsRead)
	mux.HandleFunc("POST /api/notifications/read-all", h.MarkAllNotificationsAsRead)
	mux.HandleFunc("GET /api/notifications/unread", h.GetUnreadNotificationsCount)

	// File Upload API (Загрузка фотографий и файлов с диска)
	mux.HandleFunc("POST /api/upload", h.UploadFile)

	// Real-time Server-Sent Events (SSE) Hub
	mux.HandleFunc("GET /api/events", h.SSEHandler)
}

func noCacheFileServer(fs http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})
}
