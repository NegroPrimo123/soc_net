package graph

import (
	"testing"
)

func TestGraphAlgorithms(t *testing.T) {
	g := NewGraph()

	// Создаем сеть из 5 пользователей:
	// 1 (Alice) -> 2 (Bob) -> 3 (Charlie) -> 4 (David)
	// 1 (Alice) -> 5 (Eve) -> 3 (Charlie)
	g.AddNode(1, "alice", "Alice", "", 1, "Новичок", "")
	g.AddNode(2, "bob", "Bob", "", 2, "Стрит-кид", "")
	g.AddNode(3, "charlie", "Charlie", "", 3, "Фиксер", "")
	g.AddNode(4, "david", "David", "", 4, "Соло", "")
	g.AddNode(5, "eve", "Eve", "", 5, "Техник", "")

	g.AddEdge(1, 2, 1.0, true)
	g.AddEdge(2, 3, 1.0, true)
	g.AddEdge(3, 4, 1.0, true)
	g.AddEdge(1, 5, 1.0, true)
	g.AddEdge(5, 3, 1.0, true)

	// Взаимная связь между 1 и 2
	g.AddEdge(2, 1, 1.0, true)

	// 1. Тест BFS: Кратчайший путь (Alice -> Charlie)
	deg, path := g.FindShortestPath(1, 3)
	if deg != 2 {
		t.Fatalf("expected degree 2 for Alice -> Charlie, got %d", deg)
	}
	if len(path) != 3 || path[0] != 1 || path[2] != 3 {
		t.Fatalf("unexpected path: %v", path)
	}

	// Кратчайший путь (Alice -> David)
	degD, pathD := g.FindShortestPath(1, 4)
	if degD != 3 {
		t.Fatalf("expected degree 3 for Alice -> David, got %d", degD)
	}
	if len(pathD) != 4 {
		t.Fatalf("unexpected path length for Alice -> David: %v", pathD)
	}

	// 2. Тест Personalized PageRank
	ppr := g.PersonalizedPageRank(1, 0.85, 30)
	if ppr == nil {
		t.Fatalf("PPR returned nil")
	}
	if ppr[2] <= 0 || ppr[3] <= 0 {
		t.Fatalf("PPR scores for reachable nodes should be positive: %v", ppr)
	}
	// Bob (2) напрямую связан с Alice, его вес должен быть выше, чем у David (4)
	if ppr[2] <= ppr[4] {
		t.Fatalf("expected direct neighbor Bob to have higher PPR than distant David: Bob=%f, David=%f", ppr[2], ppr[4])
	}

	// 3. Тест Рекомендаций (Adamic-Adar)
	// Для Alice (1) Charlie (3) является общим другом Bob (2) и Eve (5), поэтому должен быть рекомендован №1
	recs := g.GetRecommendations(1, 5)
	if len(recs) == 0 {
		t.Fatalf("expected recommendations for Alice, got none")
	}
	if recs[0].User.ID != 3 {
		t.Fatalf("expected top recommendation to be Charlie (3), got %d (%s)", recs[0].User.ID, recs[0].User.DisplayName)
	}
	if recs[0].MutualCount != 2 {
		t.Fatalf("expected 2 mutual connections for Charlie, got %d", recs[0].MutualCount)
	}

	// 4. Тест Ego-Graph
	nodes, edges := g.GetEgoGraph(1, 10)
	if len(nodes) < 3 || len(edges) < 2 {
		t.Fatalf("ego graph extraction too small: %d nodes, %d edges", len(nodes), len(edges))
	}
}
