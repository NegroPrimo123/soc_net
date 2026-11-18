package ranking

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"social-network/internal/graph"
	"social-network/internal/models"
)

var hashtagRegex = regexp.MustCompile(`#([a-zA-Zа-яА-Я0-9_]+)`)

// RankingWeights содержит весовые коэффициенты многофакторного скоринга.
type RankingWeights struct {
	GraphAffinity float64 // вес графовой близости (0.35)
	Freshness     float64 // вес свежести контента (0.30)
	Engagement    float64 // вес виральности и активности (0.20)
	TopicMatch    float64 // вес совпадения интересов/тегов (0.15)
	Diversity     float64 // штраф за дублирование автора (0.25)
}

// DefaultWeights возвращает сбалансированные веса по умолчанию.
func DefaultWeights() RankingWeights {
	return RankingWeights{
		GraphAffinity: 0.35,
		Freshness:     0.30,
		Engagement:    0.20,
		TopicMatch:    0.15,
		Diversity:     0.25,
	}
}

// Engine персональный рекомендательный движок ранжирования контента.
type Engine struct {
	graph   *graph.Graph
	weights RankingWeights
}

// NewEngine создает новый экземпляр ранжирующего движка.
func NewEngine(g *graph.Graph) *Engine {
	return &Engine{
		graph:   g,
		weights: DefaultWeights(),
	}
}

// ExtractHashtags извлекает хэштеги из текста записи.
func ExtractHashtags(content string) []string {
	matches := hashtagRegex.FindAllStringSubmatch(content, -1)
	var tags []string
	seen := make(map[string]bool)
	for _, m := range matches {
		if len(m) > 1 {
			tag := strings.ToLower(m[1])
			if !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// RankFeed ранжирует список постов для конкретного пользователя viewerID.
// Возвращает отсортированный срез постов с заполненным объектом RankingFactors.
func (e *Engine) RankFeed(viewerID int, posts []models.Post, viewerPreferredTags []string) []models.Post {
	if len(posts) == 0 {
		return posts
	}

	tagSet := make(map[string]bool)
	for _, t := range viewerPreferredTags {
		tagSet[strings.ToLower(strings.TrimPrefix(t, "#"))] = true
	}
	// Дефолтные интересы в Cyberpunk соцсети, если профиль пустой
	if len(tagSet) == 0 {
		tagSet["cyberpunk"] = true
		tagSet["go"] = true
		tagSet["music"] = true
		tagSet["neon"] = true
	}

	now := time.Now()
	authorOccurrences := make(map[int]int)

	ranked := make([]models.Post, len(posts))
	copy(ranked, posts)

	// 1. Предварительный расчет скоринга
	for i := range ranked {
		p := &ranked[i]

		// А. Графовая близость (Graph Affinity)
		affinity := 0.1
		affinityExpl := "Открытая сеть"
		if e.graph != nil {
			if viewerID > 0 {
				affinity = e.graph.GetAffinityScore(viewerID, p.UserID)
				if viewerID == p.UserID {
					affinity = 0.95
					affinityExpl = "Ваша публикация"
				} else if affinity >= 0.8 {
					affinityExpl = "Прямой контакт / Взаимная подписка"
				} else if affinity >= 0.3 {
					affinityExpl = "Связь через общих знакомых (2-я степень)"
				} else {
					affinityExpl = "Рекомендация по графу интересов"
				}
			}
		}

		// Б. Свежесть контента (Freshness Decay)
		hoursAge := math.Max(0.0, now.Sub(p.CreatedAt).Hours())
		// Функция полураспада: 1 / (1 + 0.15 * hours)^0.85
		freshness := 1.0 / math.Pow(1.0+0.15*hoursAge, 0.85)
		freshnessExpl := fmt.Sprintf("%.1f ч. назад (затухание: %.2f)", hoursAge, freshness)
		if hoursAge < 1.0 {
			freshnessExpl = fmt.Sprintf("Свежий пост: %d мин назад", int(hoursAge*60))
		}

		// В. Вовлеченность (Engagement)
		// Учитывает лайки, комментарии, опросы и прикрепленную музыку
		engageRaw := float64(p.LikesCount*2 + p.CommentsCount*3)
		if p.Poll != nil {
			engageRaw += 4.0
		}
		if p.MusicURL != "" {
			engageRaw += 2.0
		}
		if p.ImageURL != "" {
			engageRaw += 1.5
		}
		// Нормализация через log2
		engagement := math.Min(1.5, math.Log2(1.0+engageRaw)/5.0)
		engagementExpl := fmt.Sprintf("%d лайков, %d комментов", p.LikesCount, p.CommentsCount)
		if p.Poll != nil {
			engagementExpl += ", интерактивный опрос"
		}

		// Г. Совпадение тематик (Topic Match)
		postTags := ExtractHashtags(p.Content)
		matchCount := 0
		for _, pt := range postTags {
			if tagSet[pt] {
				matchCount++
			}
		}
		topicMatch := 0.2
		topicExpl := "Общая тематика"
		if len(postTags) > 0 {
			topicMatch = math.Min(1.0, 0.3+float64(matchCount)*0.35)
			if matchCount > 0 {
				topicExpl = fmt.Sprintf("Совпадение по %d тегам", matchCount)
			} else {
				topicExpl = fmt.Sprintf("Теги: #%s", strings.Join(postTags, ", #"))
			}
		}

		// Д. Штраф за разнообразие авторов (Diversity Penalty)
		authorCount := authorOccurrences[p.UserID]
		divPenalty := float64(authorCount) * e.weights.Diversity
		authorOccurrences[p.UserID]++

		// Итоговый скоринг
		totalScore := (e.weights.GraphAffinity * affinity) +
			(e.weights.Freshness * freshness) +
			(e.weights.Engagement * engagement) +
			(e.weights.TopicMatch * topicMatch) -
			divPenalty

		if totalScore < 0.05 {
			totalScore = 0.05
		}

		p.RankingScore = math.Round(totalScore*100) / 100
		p.RankingFactors = &models.RankingFactors{
			FinalScore:            p.RankingScore,
			GraphAffinity:         math.Round(affinity*100) / 100,
			FreshnessScore:        math.Round(freshness*100) / 100,
			EngagementScore:       math.Round(engagement*100) / 100,
			TopicMatchScore:       math.Round(topicMatch*100) / 100,
			DiversityPenalty:      math.Round(divPenalty*100) / 100,
			AffinityExplanation:   affinityExpl,
			FreshnessExplanation:  freshnessExpl,
			EngagementExplanation: engagementExpl,
			TopicExplanation:      topicExpl,
		}
	}

	// 2. Сортировка по итоговому рангу Score
	sort.SliceStable(ranked, func(i, j int) bool {
		return ranked[i].RankingScore > ranked[j].RankingScore
	})

	return ranked
}
