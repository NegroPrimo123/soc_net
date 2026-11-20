package repository

import (
	"database/sql"
	"fmt"
	"time"

	"social-network/internal/models"
)

type StoryRepository struct {
	db *sql.DB
}

func NewStoryRepository(db *sql.DB) *StoryRepository {
	return &StoryRepository{db: db}
}

// CreateStory создает новую временную историю с заданным сроком жизни (по умолчанию 24 часа).
func (r *StoryRepository) CreateStory(userID int, req *models.CreateStoryRequest) (*models.Story, error) {
	durationHours := 24
	if req.DurationHours > 0 && req.DurationHours <= 72 {
		durationHours = req.DurationHours
	}

	bgGradient := req.BgGradient
	if bgGradient == "" {
		bgGradient = "linear-gradient(135deg, #00f0ff 0%, #3b82f6 100%)"
	}

	expiresAt := time.Now().Add(time.Duration(durationHours) * time.Hour)

	fontFamily := req.FontFamily
	if fontFamily == "" {
		fontFamily = "cyber"
	}
	textAlign := req.TextAlign
	if textAlign == "" {
		textAlign = "center"
	}
	textColor := req.TextColor
	if textColor == "" {
		textColor = "#ffffff"
	}
	sticker := req.Sticker

	query := `
		INSERT INTO stories (user_id, media_url, caption, bg_gradient, font_family, text_align, text_color, sticker, views_count, created_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW(), $9)
		RETURNING id, created_at, expires_at
	`
	var story models.Story
	story.UserID = userID
	story.MediaURL = req.MediaURL
	story.Caption = req.Caption
	story.BgGradient = bgGradient
	story.FontFamily = fontFamily
	story.TextAlign = textAlign
	story.TextColor = textColor
	story.Sticker = sticker

	err := r.db.QueryRow(query, userID, req.MediaURL, req.Caption, bgGradient, fontFamily, textAlign, textColor, sticker, expiresAt).
		Scan(&story.ID, &story.CreatedAt, &story.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("create story: %w", err)
	}

	return r.GetStoryByID(story.ID, userID)
}

// GetStoryByID возвращает историю по идентификатору с информацией об авторе и статусом просмотра.
func (r *StoryRepository) GetStoryByID(storyID, viewerUserID int) (*models.Story, error) {
	query := `
		SELECT 
			s.id, s.user_id, COALESCE(s.media_url, ''), COALESCE(s.caption, ''), 
			COALESCE(s.bg_gradient, ''), COALESCE(s.font_family, 'cyber'),
			COALESCE(s.text_align, 'center'), COALESCE(s.text_color, '#ffffff'),
			COALESCE(s.sticker, ''), s.views_count, s.created_at, s.expires_at,
			u.id, u.username, u.display_name, u.avatar_url,
			EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $2) as is_viewed
		FROM stories s
		JOIN users u ON u.id = s.user_id
		WHERE s.id = $1
	`
	var st models.Story
	var u models.User
	err := r.db.QueryRow(query, storyID, viewerUserID).Scan(
		&st.ID, &st.UserID, &st.MediaURL, &st.Caption,
		&st.BgGradient, &st.FontFamily, &st.TextAlign, &st.TextColor, &st.Sticker,
		&st.ViewsCount, &st.CreatedAt, &st.ExpiresAt,
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
		&st.IsViewed,
	)
	if err != nil {
		return nil, err
	}
	st.User = &u
	return &st, nil
}

// GetActiveStories возвращает все актуальные (не истекшие) истории, сгруппированные по пользователям.
func (r *StoryRepository) GetActiveStories(viewerUserID int) ([]models.StoryGroup, error) {
	query := `
		SELECT 
			s.id, s.user_id, COALESCE(s.media_url, ''), COALESCE(s.caption, ''), 
			COALESCE(s.bg_gradient, ''), COALESCE(s.font_family, 'cyber'),
			COALESCE(s.text_align, 'center'), COALESCE(s.text_color, '#ffffff'),
			COALESCE(s.sticker, ''), s.views_count, s.created_at, s.expires_at,
			u.id, u.username, u.display_name, u.avatar_url,
			EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $1) as is_viewed
		FROM stories s
		JOIN users u ON u.id = s.user_id
		WHERE s.expires_at > NOW()
		ORDER BY s.created_at ASC
	`
	rows, err := r.db.Query(query, viewerUserID)
	if err != nil {
		return nil, fmt.Errorf("query active stories: %w", err)
	}
	defer rows.Close()

	// Группировка историй по пользователям
	groupsMap := make(map[int]*models.StoryGroup)
	var userOrder []int

	for rows.Next() {
		var st models.Story
		var u models.User
		if err := rows.Scan(
			&st.ID, &st.UserID, &st.MediaURL, &st.Caption,
			&st.BgGradient, &st.FontFamily, &st.TextAlign, &st.TextColor, &st.Sticker,
			&st.ViewsCount, &st.CreatedAt, &st.ExpiresAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
			&st.IsViewed,
		); err != nil {
			return nil, fmt.Errorf("scan story: %w", err)
		}
		st.User = &u

		grp, exists := groupsMap[u.ID]
		if !exists {
			grp = &models.StoryGroup{
				UserID:      u.ID,
				User:        u,
				Stories:     []models.Story{},
				HasUnviewed: false,
				LatestAt:    st.CreatedAt,
			}
			groupsMap[u.ID] = grp
			userOrder = append(userOrder, u.ID)
		}

		grp.Stories = append(grp.Stories, st)
		if !st.IsViewed {
			grp.HasUnviewed = true
		}
		if st.CreatedAt.After(grp.LatestAt) {
			grp.LatestAt = st.CreatedAt
		}
	}

	// Сортировка: сначала текущий пользователь (если есть истории), затем непросмотренные, затем просмотренные
	var unviewedGroups []models.StoryGroup
	var viewedGroups []models.StoryGroup
	var selfGroup *models.StoryGroup

	for _, uid := range userOrder {
		grp := *groupsMap[uid]
		if uid == viewerUserID {
			selfGroup = &grp
		} else if grp.HasUnviewed {
			unviewedGroups = append(unviewedGroups, grp)
		} else {
			viewedGroups = append(viewedGroups, grp)
		}
	}

	result := make([]models.StoryGroup, 0, len(groupsMap))
	if selfGroup != nil {
		result = append(result, *selfGroup)
	}
	result = append(result, unviewedGroups...)
	result = append(result, viewedGroups...)

	return result, nil
}

// MarkStoryViewed отмечает историю просмотренной пользователем и увеличивает счетчик просмотров.
func (r *StoryRepository) MarkStoryViewed(storyID, viewerUserID int) error {
	res, err := r.db.Exec(`
		INSERT INTO story_views (story_id, user_id, viewed_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (story_id, user_id) DO NOTHING
	`, storyID, viewerUserID)
	if err != nil {
		return fmt.Errorf("mark story viewed: %w", err)
	}

	// Если просмотр был впервые вставлен, инкрементируем views_count
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected > 0 {
		_, _ = r.db.Exec(`UPDATE stories SET views_count = views_count + 1 WHERE id = $1`, storyID)
	}
	return nil
}

// DeleteStory удаляет историю (только если автор совпадает).
func (r *StoryRepository) DeleteStory(storyID, userID int) error {
	res, err := r.db.Exec(`DELETE FROM stories WHERE id = $1 AND user_id = $2`, storyID, userID)
	if err != nil {
		return fmt.Errorf("delete story: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("история не найдена или нет прав на удаление")
	}
	return nil
}
