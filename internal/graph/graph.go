package graph

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"
)

// Node представляет узел графа (пользователь платформы).
type Node struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
	Level       int    `json:"level"`
	LevelTitle  string `json:"level_title"`
	Bio         string `json:"bio"`
}

// Edge представляет направленное ребро в социальном графе.
type Edge struct {
	SourceID         int       `json:"source_id"`
	TargetID         int       `json:"target_id"`
	Weight           float64   `json:"weight"`
	IsFollow         bool      `json:"is_follow"`
	IsMutual         bool      `json:"is_mutual"`
	InteractionCount int       `json:"interaction_count"`
	LastInteraction  time.Time `json:"last_interaction"`
}

// Graph потокобезопасная графовая структура данных социального графа.
type Graph struct {
	mu         sync.RWMutex
	nodes      map[int]*Node
	adj        map[int]map[int]*Edge // out-edges: source -> target -> Edge
	reverseAdj map[int]map[int]*Edge // in-edges: target -> source -> Edge
}

// NewGraph создает пустой социальный граф.
func NewGraph() *Graph {
	return &Graph{
		nodes:      make(map[int]*Node),
		adj:        make(map[int]map[int]*Edge),
		reverseAdj: make(map[int]map[int]*Edge),
	}
}

// AddNode добавляет или обновляет узел в графе.
func (g *Graph) AddNode(id int, username, displayName, avatarURL string, level int, levelTitle, bio string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.nodes[id] = &Node{
		ID:          id,
		Username:    username,
		DisplayName: displayName,
		AvatarURL:   avatarURL,
		Level:       level,
		LevelTitle:  levelTitle,
		Bio:         bio,
	}
	if _, ok := g.adj[id]; !ok {
		g.adj[id] = make(map[int]*Edge)
	}
	if _, ok := g.reverseAdj[id]; !ok {
		g.reverseAdj[id] = make(map[int]*Edge)
	}
}

// AddEdge добавляет или обновляет ребро между узлами.
func (g *Graph) AddEdge(source, target int, baseWeight float64, isFollow bool) {
	if source == target {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, ok := g.nodes[source]; !ok {
		return
	}
	if _, ok := g.nodes[target]; !ok {
		return
	}

	edge, exists := g.adj[source][target]
	if !exists {
		edge = &Edge{
			SourceID:        source,
			TargetID:        target,
			Weight:          baseWeight,
			IsFollow:        isFollow,
			LastInteraction: time.Now(),
		}
		g.adj[source][target] = edge
		g.reverseAdj[target][source] = edge
	} else {
		if isFollow {
			edge.IsFollow = true
		}
		edge.Weight += baseWeight
		edge.LastInteraction = time.Now()
	}

	// Проверяем взаимность связи
	if reverseEdge, revExists := g.adj[target][source]; revExists && edge.IsFollow && reverseEdge.IsFollow {
		edge.IsMutual = true
		reverseEdge.IsMutual = true
		edge.Weight += 1.5
		reverseEdge.Weight += 1.5
	}
}

// RecordInteraction регистрирует взаимодействие (лайк, коммент, сообщение) между пользователями.
func (g *Graph) RecordInteraction(source, target int, interactionType string) {
	if source == target {
		return
	}
	weightDelta := 0.2
	switch interactionType {
	case "like":
		weightDelta = 0.25
	case "comment":
		weightDelta = 0.6
	case "message", "dm":
		weightDelta = 1.0
	case "gift":
		weightDelta = 1.2
	case "poll_vote":
		weightDelta = 0.3
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	edge, exists := g.adj[source][target]
	if !exists {
		edge = &Edge{
			SourceID:         source,
			TargetID:         target,
			Weight:           weightDelta,
			IsFollow:         false,
			InteractionCount: 1,
			LastInteraction:  time.Now(),
		}
		g.adj[source][target] = edge
		g.reverseAdj[target][source] = edge
	} else {
		edge.Weight += weightDelta
		edge.InteractionCount++
		edge.LastInteraction = time.Now()
	}
}

// BuildFromDB загружает топологию графа из PostgreSQL.
func (g *Graph) BuildFromDB(db *sql.DB) error {
	log.Println("[SocialGraph] Инициализация графа связей из PostgreSQL...")

	// 1. Загрузка пользователей (узлов)
	userRows, err := db.Query(`
		SELECT id, username, display_name, avatar_url, account_level, bio 
		FROM users
	`)
	if err != nil {
		return fmt.Errorf("failed to query users for graph: %w", err)
	}
	defer userRows.Close()

	userCount := 0
	for userRows.Next() {
		var id, level int
		var username, displayName, avatarURL, bio string
		if err := userRows.Scan(&id, &username, &displayName, &avatarURL, &level, &bio); err != nil {
			continue
		}
		g.AddNode(id, username, displayName, avatarURL, level, fmt.Sprintf("Ур. %d", level), bio)
		userCount++
	}

	// 2. Загрузка подписок (базовые направленные ребра)
	followRows, err := db.Query(`SELECT follower_id, following_id FROM follows`)
	if err == nil {
		defer followRows.Close()
		followCount := 0
		for followRows.Next() {
			var follower, following int
			if err := followRows.Scan(&follower, &following); err == nil {
				g.AddEdge(follower, following, 1.0, true)
				followCount++
			}
		}
		log.Printf("[SocialGraph] Загружено %d узлов и %d связей подписок", userCount, followCount)
	}

	// 3. Загрузка интеракций: лайки к постам авторов
	likeRows, err := db.Query(`
		SELECT l.user_id, p.user_id, COUNT(*) 
		FROM likes l 
		JOIN posts p ON p.id = l.post_id 
		WHERE l.user_id != p.user_id 
		GROUP BY l.user_id, p.user_id
	`)
	if err == nil {
		defer likeRows.Close()
		for likeRows.Next() {
			var u1, u2, cnt int
			if err := likeRows.Scan(&u1, &u2, &cnt); err == nil {
				for i := 0; i < cnt && i < 10; i++ {
					g.RecordInteraction(u1, u2, "like")
				}
			}
		}
	}

	// 4. Загрузка интеракций: комментарии к постам авторов
	commentRows, err := db.Query(`
		SELECT c.user_id, p.user_id, COUNT(*) 
		FROM comments c 
		JOIN posts p ON p.id = c.post_id 
		WHERE c.user_id != p.user_id 
		GROUP BY c.user_id, p.user_id
	`)
	if err == nil {
		defer commentRows.Close()
		for commentRows.Next() {
			var u1, u2, cnt int
			if err := commentRows.Scan(&u1, &u2, &cnt); err == nil {
				for i := 0; i < cnt && i < 10; i++ {
					g.RecordInteraction(u1, u2, "comment")
				}
			}
		}
	}

	// 5. Загрузка интеракций: личные сообщения
	msgRows, err := db.Query(`
		SELECT sender_id, receiver_id, COUNT(*) 
		FROM messages 
		WHERE sender_id != receiver_id 
		GROUP BY sender_id, receiver_id
	`)
	if err == nil {
		defer msgRows.Close()
		for msgRows.Next() {
			var s, r, cnt int
			if err := msgRows.Scan(&s, &r, &cnt); err == nil {
				for i := 0; i < cnt && i < 10; i++ {
					g.RecordInteraction(s, r, "dm")
				}
			}
		}
	}

	log.Println("[SocialGraph] Граф связей успешно собран и проиндексирован.")
	return nil
}

// GetNode возвращает копию узла по ID.
func (g *Graph) GetNode(id int) (*Node, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	n, exists := g.nodes[id]
	if !exists {
		return nil, false
	}
	cp := *n
	return &cp, true
}
