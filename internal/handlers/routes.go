package handlers

import (
	"net/http"
)

func RegisterRoutes(mux *http.ServeMux, h *Handler) {
	// Static assets
	fs := http.FileServer(http.Dir("web/static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", fs))

	// Web pages
	mux.HandleFunc("GET /", h.Index)

	// Auth API
	mux.HandleFunc("POST /api/auth/register", h.Register)
	mux.HandleFunc("POST /api/auth/login", h.Login)
	mux.HandleFunc("POST /api/auth/logout", h.Logout)
	mux.HandleFunc("GET /api/auth/me", h.Me)

	// Feed & Posts API
	mux.HandleFunc("GET /api/feed", h.GetFeed)
	mux.HandleFunc("POST /api/posts", h.CreatePost)
	mux.HandleFunc("PUT /api/posts/{id}", h.UpdatePost)
	mux.HandleFunc("POST /api/posts/{id}/edit", h.UpdatePost)
	mux.HandleFunc("DELETE /api/posts/{id}", h.DeletePost)
	mux.HandleFunc("POST /api/posts/{id}/delete", h.DeletePost)
	mux.HandleFunc("POST /api/posts/{id}/like", h.ToggleLike)
	mux.HandleFunc("POST /api/posts/{id}/comments", h.CreateComment)

	// Users & Profile API
	mux.HandleFunc("GET /api/users", h.GetUsers)
	mux.HandleFunc("GET /api/users/{id}/profile", h.GetUserProfile)
	mux.HandleFunc("GET /api/users/{id}/gifts", h.GetUserGifts)
	mux.HandleFunc("PUT /api/users/profile", h.UpdateProfile)
	mux.HandleFunc("POST /api/users/follow", h.ToggleFollow)

	// Gifts API
	mux.HandleFunc("POST /api/gifts", h.SendGift)
	mux.HandleFunc("GET /api/gifts/showcase", h.GetShowcaseGifts)

	// Real-time Server-Sent Events (SSE) Hub
	mux.HandleFunc("GET /api/events", h.SSEHandler)
}
