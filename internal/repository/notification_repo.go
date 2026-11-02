package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"social-network/internal/models"

	"github.com/lib/pq"
)

type NotificationRepository struct {
	db *sql.DB
}

func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) CreateNotification(userID, actorID int, actionType string, targetID int, content string) (*models.Notification, error) {
	// Не создаем уведомление, если действие совершено над самим собой
	if userID == actorID {
		return nil, nil
	}

	query := `
	INSERT INTO notifications (user_id, actor_id, action_type, target_id, content, is_read, created_at)
	VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
	RETURNING id, created_at
	`
	var n models.Notification
	n.UserID = userID
	n.ActorID = actorID
	n.ActionType = actionType
	n.TargetID = targetID
	n.Content = content
	n.IsRead = false

	err := r.db.QueryRow(query, userID, actorID, actionType, targetID, content).Scan(&n.ID, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create notification: %w", err)
	}

	// Загружаем данные инициатора (актора)
	queryActor := `SELECT id, username, display_name, avatar_url, bio FROM users WHERE id = $1`
	var actor models.User
	if err := r.db.QueryRow(queryActor, actorID).Scan(&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL, &actor.Bio); err == nil {
		n.Actor = &actor
	}

	return &n, nil
}

func (r *NotificationRepository) GetGroupedNotifications(userID int, limit int) ([]models.GroupedNotification, error) {
	if limit <= 0 {
		limit = 50
	}

	query := `
	SELECT 
		n.id, n.user_id, n.actor_id, n.action_type, n.target_id, n.content, n.is_read, n.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM notifications n
	JOIN users u ON u.id = n.actor_id
	WHERE n.user_id = $1
	ORDER BY n.created_at DESC
	LIMIT $2
	`
	rows, err := r.db.Query(query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("query notifications: %w", err)
	}
	defer rows.Close()

	var rawList []models.Notification
	for rows.Next() {
		var n models.Notification
		var actor models.User
		if err := rows.Scan(
			&n.ID, &n.UserID, &n.ActorID, &n.ActionType, &n.TargetID, &n.Content, &n.IsRead, &n.CreatedAt,
			&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL, &actor.Bio,
		); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		n.Actor = &actor
		rawList = append(rawList, n)
	}

	// Алгоритм умной группировки уведомлений для исключения "каши"
	groupedMap := make(map[string]*models.GroupedNotification)
	var orderedKeys []string

	for _, n := range rawList {
		var groupKey string
		switch n.ActionType {
		case "like":
			groupKey = fmt.Sprintf("like_%d", n.TargetID)
		case "comment":
			groupKey = fmt.Sprintf("comment_%d", n.TargetID)
		case "follow":
			groupKey = "follow_all"
		case "message":
			groupKey = fmt.Sprintf("message_%d", n.ActorID)
		case "gift":
			groupKey = fmt.Sprintf("gift_%d", n.ID)
		default:
			groupKey = fmt.Sprintf("generic_%s_%d", n.ActionType, n.TargetID)
		}

		group, exists := groupedMap[groupKey]
		if !exists {
			group = &models.GroupedNotification{
				GroupKey:   groupKey,
				ActionType: n.ActionType,
				TargetID:   n.TargetID,
				TotalCount: 0,
				Actors:     []models.User{},
				IsRead:     true, // Будет false, если хотя бы 1 не прочитано
				LatestAt:   n.CreatedAt,
				IDs:        []int{},
			}
			groupedMap[groupKey] = group
			orderedKeys = append(orderedKeys, groupKey)
		}

		group.TotalCount++
		group.IDs = append(group.IDs, n.ID)
		if !n.IsRead {
			group.IsRead = false
		}
		if n.CreatedAt.After(group.LatestAt) {
			group.LatestAt = n.CreatedAt
		}

		// Добавляем актора в список (уникальные, до 3 для стека аватаров)
		if n.Actor != nil {
			alreadyPresent := false
			for _, a := range group.Actors {
				if a.ID == n.Actor.ID {
					alreadyPresent = true
					break
				}
			}
			if !alreadyPresent && len(group.Actors) < 3 {
				group.Actors = append(group.Actors, *n.Actor)
			}
		}

		if group.Snippet == "" && n.Content != "" {
			group.Snippet = n.Content
		}
	}

	// Формирование читаемых заголовков и локализованных текстов
	var result []models.GroupedNotification
	for _, key := range orderedKeys {
		g := groupedMap[key]

		firstActorName := "Пользователь"
		if len(g.Actors) > 0 {
			firstActorName = g.Actors[0].DisplayName
		}

		switch g.ActionType {
		case "like":
			if g.TotalCount == 1 {
				g.Title = fmt.Sprintf("%s оценил(а) вашу публикацию", firstActorName)
			} else if g.TotalCount == 2 && len(g.Actors) >= 2 {
				g.Title = fmt.Sprintf("%s и %s оценили вашу публикацию", g.Actors[0].DisplayName, g.Actors[1].DisplayName)
			} else {
				g.Title = fmt.Sprintf("%s и ещё %d пользователей оценили вашу публикацию", firstActorName, g.TotalCount-1)
			}
			g.Snippet = "❤️ Отметка «Нравится» к вашей записи"

		case "comment":
			if g.TotalCount == 1 {
				g.Title = fmt.Sprintf("%s прокомментировал(а) вашу публикацию", firstActorName)
			} else {
				g.Title = fmt.Sprintf("%s и ещё %d пользователей оставили комментарии", firstActorName, g.TotalCount-1)
			}
			if g.Snippet == "" {
				g.Snippet = "💬 Новый комментарий к публикации"
			} else {
				g.Snippet = fmt.Sprintf("«%s»", truncateString(g.Snippet, 80))
			}

		case "follow":
			if g.TotalCount == 1 {
				g.Title = fmt.Sprintf("%s подписался(-лась) на ваши обновления", firstActorName)
			} else {
				g.Title = fmt.Sprintf("%s и ещё %d пользователей подписались на вас", firstActorName, g.TotalCount-1)
			}
			g.Snippet = "👥 Новый подписчик в вашей сети"

		case "message":
			if g.TotalCount == 1 {
				g.Title = fmt.Sprintf("Новое сообщение от %s", firstActorName)
			} else {
				g.Title = fmt.Sprintf("%s прислал(а) %d новых сообщений", firstActorName, g.TotalCount)
			}
			if g.Snippet == "" {
				g.Snippet = "✉️ Личное сообщение в чате"
			} else {
				g.Snippet = truncateString(g.Snippet, 80)
			}

		case "gift":
			giftName := humanGiftTitle(g.Snippet)
			g.Title = fmt.Sprintf("%s отправил(а) вам подарок!", firstActorName)
			g.Snippet = fmt.Sprintf("🎁 «%s» добавлен в вашу коллекцию артефактов", giftName)

		default:
			g.Title = fmt.Sprintf("Новое уведомление от %s", firstActorName)
		}

		result = append(result, *g)
	}

	return result, nil
}

func (r *NotificationRepository) MarkAsRead(userID int, ids []int) error {
	if len(ids) == 0 {
		return nil
	}
	query := `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2)`
	_, err := r.db.Exec(query, userID, pq.Array(ids))
	return err
}

func (r *NotificationRepository) MarkAllAsRead(userID int) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`
	_, err := r.db.Exec(query, userID)
	return err
}

func (r *NotificationRepository) GetUnreadCount(userID int) (int, error) {
	query := `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`
	var count int
	err := r.db.QueryRow(query, userID).Scan(&count)
	return count, err
}

func truncateString(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) <= maxLen {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxLen-3]) + "..."
}

func humanGiftTitle(giftType string) string {
	switch giftType {
	case "cyber_katana":
		return "Кибер-Катана"
	case "neuro_visor":
		return "Нейро-Визор HUD"
	case "quantum_heart", "cyber_heart", "festive_box", "supernova":
		return "Квантовое Кибер-Сердце"
	case "samurai_helmet", "cyber_skull", "bear_heart", "quantum_crown":
		return "Боевой Шлем Самурая Oni"
	case "synthwave_cassette", "cozy_cup", "moon_rocket":
		return "Синтвейв Нейро-Кассета"
	case "mantis_blade":
		return "Клинок Богомола"
	case "tactical_drone", "cyber_drone", "gentle_bouquet", "quantum_diamond":
		return "Тактический Кибер-Дрон"
	case "emp_grenade":
		return "Плазменная ЭМИ-Граната"
	case "combat_stim", "neuro_stimulator", "infinite_coffee":
		return "Нейро-Инжектор «MaxDoc»"
	default:
		return "Кибер-подарок"
	}
}
