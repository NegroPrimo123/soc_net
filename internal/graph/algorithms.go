package graph

import (
	"container/list"
	"fmt"
	"math"
	"sort"
)

// GraphNodeDTO объект передачи данных узла для API и фронтенда.
type GraphNodeDTO struct {
	ID          int     `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   string  `json:"avatar_url"`
	Level       int     `json:"level"`
	LevelTitle  string  `json:"level_title"`
	Degree      int     `json:"degree"`
	Affinity    float64 `json:"affinity"`
	Category    string  `json:"category"` // 'self', 'direct', 'second_degree', 'suggested'
}

// GraphEdgeDTO объект передачи данных ребра.
type GraphEdgeDTO struct {
	Source   int     `json:"source"`
	Target   int     `json:"target"`
	Type     string  `json:"type"` // 'follow', 'mutual', 'interaction'
	Weight   float64 `json:"weight"`
	IsMutual bool    `json:"is_mutual"`
}

// GraphRecommendation кандидат в рекомендации на основе топологии графа.
type GraphRecommendation struct {
	User           Node     `json:"user"`
	Score          float64  `json:"score"`
	MutualCount    int      `json:"mutual_count"`
	MutualFriends  []Node   `json:"mutual_friends"`
	CommonInterests []string `json:"common_interests"`
	Reason         string   `json:"reason"`
}

// PersonalizedPageRank вычисляет авторитетность и графовую близость всех узлов относительно источника (PPR).
// alpha — фактор телепортации (обычно 0.85). С вероятностью (1 - alpha) случайный блуждатель возвращается к sourceID.
func (g *Graph) PersonalizedPageRank(sourceID int, alpha float64, maxIter int) map[int]float64 {
	g.mu.RLock()
	defer g.mu.RUnlock()

	N := len(g.nodes)
	if N == 0 {
		return nil
	}

	scores := make(map[int]float64, N)
	for id := range g.nodes {
		scores[id] = 0.0
	}
	// Инициализация: вся масса сосредоточена в исходном узле
	scores[sourceID] = 1.0

	// Вычисляем суммарный исходящий вес для каждого узла
	outWeights := make(map[int]float64, N)
	for u, neighbors := range g.adj {
		totalW := 0.0
		for _, e := range neighbors {
			totalW += e.Weight
		}
		outWeights[u] = totalW
	}

	// Итерационный процесс Random Walk with Restart (Power Iteration)
	for iter := 0; iter < maxIter; iter++ {
		nextScores := make(map[int]float64, N)
		for id := range g.nodes {
			nextScores[id] = 0.0
		}

		for u, score := range scores {
			if score <= 0.0 {
				continue
			}
			totalW := outWeights[u]
			if totalW > 0 {
				for v, e := range g.adj[u] {
					transitionProb := e.Weight / totalW
					nextScores[v] += alpha * score * transitionProb
				}
			} else {
				// Если сток — возвращаемся в source
				nextScores[sourceID] += alpha * score
			}
		}

		// Рестарт: случайный возврат в исходный узел sourceID
		nextScores[sourceID] += (1.0 - alpha)

		// Проверка сходимости
		delta := 0.0
		for id := range nextScores {
			delta += math.Abs(nextScores[id] - scores[id])
		}
		scores = nextScores
		if delta < 1e-6 {
			break
		}
	}

	return scores
}

// FindShortestPath находит кратчайший путь и степень разделения (рукопожатий) между двумя пользователями через BFS.
// Возвращает degree (1 - прямая связь, 2 - через одного человека и т.д.) и последовательность ID узлов пути.
func (g *Graph) FindShortestPath(sourceID, targetID int) (int, []int) {
	if sourceID == targetID {
		return 0, []int{sourceID}
	}

	g.mu.RLock()
	defer g.mu.RUnlock()

	if _, ok := g.nodes[sourceID]; !ok {
		return -1, nil
	}
	if _, ok := g.nodes[targetID]; !ok {
		return -1, nil
	}

	queue := list.New()
	queue.PushBack(sourceID)

	visited := make(map[int]bool)
	visited[sourceID] = true

	parent := make(map[int]int)

	found := false
	for queue.Len() > 0 {
		curr := queue.Remove(queue.Front()).(int)
		if curr == targetID {
			found = true
			break
		}

		// Обходим соседей (исходящие ребра)
		for neighbor := range g.adj[curr] {
			if !visited[neighbor] {
				visited[neighbor] = true
				parent[neighbor] = curr
				queue.PushBack(neighbor)
			}
		}
	}

	if !found {
		return -1, nil
	}

	// Восстанавливаем цепочку пути
	var path []int
	curr := targetID
	for curr != sourceID {
		path = append(path, curr)
		curr = parent[curr]
	}
	path = append(path, sourceID)

	// Разворачиваем путь от source к target
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}

	degree := len(path) - 1
	return degree, path
}

// GetRecommendations вычисляет рекомендации людей, которых пользователь может знать,
// на основе индекса Адамика-Адара (Adamic-Adar) и перекрытия взаимных связей.
func (g *Graph) GetRecommendations(sourceID int, limit int) []GraphRecommendation {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if _, ok := g.nodes[sourceID]; !ok {
		return nil
	}

	// Друзья и подписки исходного пользователя
	sourceNeighbors := make(map[int]bool)
	for n := range g.adj[sourceID] {
		sourceNeighbors[n] = true
	}

	// Кандидаты: соседи соседей (2-я степень), на которых пользователь еще не подписан
	candidates := make(map[int]map[int]bool) // candidateID -> set of mutual neighbors
	for neighbor := range sourceNeighbors {
		for secondNeighbor := range g.adj[neighbor] {
			if secondNeighbor == sourceID || sourceNeighbors[secondNeighbor] {
				continue
			}
			if _, ok := candidates[secondNeighbor]; !ok {
				candidates[secondNeighbor] = make(map[int]bool)
			}
			candidates[secondNeighbor][neighbor] = true
		}
	}

	type candScore struct {
		id     int
		score  float64
		mutual []int
	}

	var scoredList []candScore
	for candID, mutualSet := range candidates {
		// Расчет индекса Адамика-Адара: Sum( 1 / log( degree(z) ) )
		score := 0.0
		var mutuals []int
		for z := range mutualSet {
			mutuals = append(mutuals, z)
			degree := len(g.adj[z])
			if degree > 1 {
				score += 1.0 / math.Log(float64(degree))
			} else {
				score += 1.0
			}
		}
		scoredList = append(scoredList, candScore{
			id:     candID,
			score:  score,
			mutual: mutuals,
		})
	}

	// Сортировка по убыванию релевантности
	sort.Slice(scoredList, func(i, j int) bool {
		return scoredList[i].score > scoredList[j].score
	})

	var result []GraphRecommendation
	for i, cs := range scoredList {
		if i >= limit {
			break
		}
		candNode, ok := g.nodes[cs.id]
		if !ok {
			continue
		}

		var mutualFriends []Node
		for _, mID := range cs.mutual {
			if mNode, exists := g.nodes[mID]; exists {
				mutualFriends = append(mutualFriends, *mNode)
			}
		}

		reason := "Общие контакты в сети"
		if len(mutualFriends) > 0 {
			reason = fmt.Sprintf("Общие знакомые: %s и еще %d", mutualFriends[0].DisplayName, len(mutualFriends)-1)
			if len(mutualFriends) == 1 {
				reason = fmt.Sprintf("Общий контакт: %s", mutualFriends[0].DisplayName)
			}
		}

		result = append(result, GraphRecommendation{
			User:          *candNode,
			Score:         math.Round(cs.score*100) / 100,
			MutualCount:   len(cs.mutual),
			MutualFriends: mutualFriends,
			Reason:        reason,
		})
	}

	return result
}

// GetAffinityScore возвращает графовую близость между sourceID и targetID в диапазоне [0.0; 1.0].
func (g *Graph) GetAffinityScore(sourceID, targetID int) float64 {
	if sourceID == targetID {
		return 1.0
	}
	g.mu.RLock()
	defer g.mu.RUnlock()

	// 1. Прямая связь
	if edge, ok := g.adj[sourceID][targetID]; ok {
		score := 0.6
		if edge.IsMutual {
			score += 0.25
		}
		if edge.InteractionCount > 0 {
			score += math.Min(0.15, float64(edge.InteractionCount)*0.03)
		}
		return math.Min(1.0, score)
	}

	// 2. Вторая степень (через общих друзей)
	commonCount := 0
	for neighbor := range g.adj[sourceID] {
		if _, ok := g.adj[neighbor][targetID]; ok {
			commonCount++
		}
	}
	if commonCount > 0 {
		return math.Min(0.5, 0.2+float64(commonCount)*0.08)
	}

	return 0.05
}

// GetEgoGraph возвращает локальную подсеть узлов и связей вокруг centerID для визуализации.
func (g *Graph) GetEgoGraph(centerID int, maxNodes int) ([]GraphNodeDTO, []GraphEdgeDTO) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	centerNode, ok := g.nodes[centerID]
	if !ok {
		return nil, nil
	}

	includedNodes := make(map[int]int) // id -> degree
	includedNodes[centerID] = 0

	// Добавляем прямых соседей (1-я степень)
	for neighbor := range g.adj[centerID] {
		includedNodes[neighbor] = 1
	}
	for revNeighbor := range g.reverseAdj[centerID] {
		includedNodes[revNeighbor] = 1
	}

	// Если места хватает, добавляем связи 2-й степени
	if len(includedNodes) < maxNodes {
		for nodeID, deg := range includedNodes {
			if deg == 1 {
				for next := range g.adj[nodeID] {
					if _, exists := includedNodes[next]; !exists {
						includedNodes[next] = 2
						if len(includedNodes) >= maxNodes {
							break
						}
					}
				}
			}
			if len(includedNodes) >= maxNodes {
				break
			}
		}
	}

	var dtoList []GraphNodeDTO
	for id, deg := range includedNodes {
		n, exists := g.nodes[id]
		if !exists {
			continue
		}
		category := "direct"
		if id == centerID {
			category = "self"
		} else if deg == 2 {
			category = "second_degree"
		}

		affinity := 1.0
		if id != centerID {
			affinity = g.GetAffinityScore(centerID, id)
		}

		dtoList = append(dtoList, GraphNodeDTO{
			ID:          n.ID,
			Username:    n.Username,
			DisplayName: n.DisplayName,
			AvatarURL:   n.AvatarURL,
			Level:       n.Level,
			LevelTitle:  n.LevelTitle,
			Degree:      deg,
			Affinity:    affinity,
			Category:    category,
		})
	}

	var edgeList []GraphEdgeDTO
	for src := range includedNodes {
		for tgt, e := range g.adj[src] {
			if _, tgtIncluded := includedNodes[tgt]; tgtIncluded {
				edgeType := "follow"
				if e.IsMutual {
					edgeType = "mutual"
				} else if e.InteractionCount > 0 {
					edgeType = "interaction"
				}
				edgeList = append(edgeList, GraphEdgeDTO{
					Source:   src,
					Target:   tgt,
					Type:     edgeType,
					Weight:   e.Weight,
					IsMutual: e.IsMutual,
				})
			}
		}
	}

	_ = centerNode
	return dtoList, edgeList
}
