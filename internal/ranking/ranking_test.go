package ranking

import (
	"testing"
	"time"

	"social-network/internal/graph"
	"social-network/internal/models"
)

func TestRankingEngine(t *testing.T) {
	g := graph.NewGraph()
	g.AddNode(1, "alice", "Alice", "", 1, "Новичок", "")
	g.AddNode(2, "bob", "Bob", "", 2, "Стрит-кид", "")
	g.AddNode(3, "charlie", "Charlie", "", 1, "Новичок", "")

	// Alice follows Bob
	g.AddEdge(1, 2, 1.0, true)

	engine := NewEngine(g)

	posts := []models.Post{
		{
			ID:            101,
			UserID:        2, // Bob (friend of Alice)
			Content:       "Fresh post with #cyberpunk and #go",
			CreatedAt:     time.Now().Add(-10 * time.Minute),
			LikesCount:    15,
			CommentsCount: 5,
		},
		{
			ID:            102,
			UserID:        3, // Charlie (stranger)
			Content:       "Old post from days ago #random",
			CreatedAt:     time.Now().Add(-72 * time.Hour),
			LikesCount:    1,
			CommentsCount: 0,
		},
	}

	ranked := engine.RankFeed(1, posts, []string{"cyberpunk", "go"})

	if len(ranked) != 2 {
		t.Fatalf("expected 2 ranked posts, got %d", len(ranked))
	}

	// Bob's fresh, engaging, topic-matching post MUST rank higher than Charlie's old post
	if ranked[0].ID != 101 {
		t.Fatalf("expected post 101 to be ranked #1, got post %d", ranked[0].ID)
	}

	factors := ranked[0].RankingFactors
	if factors == nil {
		t.Fatalf("ranking factors must not be nil")
	}

	if factors.GraphAffinity <= 0 {
		t.Fatalf("expected positive graph affinity for friend Bob")
	}

	if factors.FreshnessScore <= 0.8 {
		t.Fatalf("expected high freshness score for 10-min old post, got %f", factors.FreshnessScore)
	}
}
