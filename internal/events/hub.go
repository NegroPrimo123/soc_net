package events

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

type EventType string

const (
	EventNewPost    EventType = "new_post"
	EventLikeUpdate EventType = "like_update"
	EventNewComment EventType = "new_comment"
)

type EventMessage struct {
	Type      EventType   `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

type Client struct {
	Send chan []byte
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(25 * time.Second) // Keep-alive heartbeat
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("[SSE Hub] Client connected. Total active clients: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[SSE Hub] Client disconnected. Total active clients: %d", len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Slow / unresponsive client, drop and clean up
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			// Send heartbeat comment to keep HTTP connection alive
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- []byte(": ping\n\n"):
				default:
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Broadcast(eventType EventType, payload interface{}) {
	msg := EventMessage{
		Type:      eventType,
		Payload:   payload,
		Timestamp: time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[SSE Hub] JSON marshal error: %v", err)
		return
	}

	formatted := []byte(fmt.Sprintf("data: %s\n\n", data))
	select {
	case h.broadcast <- formatted:
	default:
		log.Println("[SSE Hub] Warning: broadcast queue full, dropping message")
	}
}

func (h *Hub) SSEHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported by client", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no") // Nginx support

	client := &Client{Send: make(chan []byte, 64)}
	h.register <- client

	// Send initial greeting event
	initMsg, _ := json.Marshal(EventMessage{
		Type:      "connected",
		Payload:   map[string]string{"status": "live", "message": "Real-time event stream connected"},
		Timestamp: time.Now(),
	})
	fmt.Fprintf(w, "data: %s\n\n", initMsg)
	flusher.Flush()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			h.unregister <- client
			return
		case msg, ok := <-client.Send:
			if !ok {
				return
			}
			_, err := w.Write(msg)
			if err != nil {
				h.unregister <- client
				return
			}
			flusher.Flush()
		}
	}
}
