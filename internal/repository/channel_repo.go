package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"social-network/internal/models"
)

type ChannelRepository struct {
	db *sql.DB
}

func NewChannelRepository(db *sql.DB) *ChannelRepository {
	return &ChannelRepository{db: db}
}

func (r *ChannelRepository) CreateChannel(creatorID int, req models.CreateChannelRequest) (*models.Channel, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("название канала обязательно")
	}

	handle := strings.TrimSpace(req.Handle)
	if !strings.HasPrefix(handle, "@") {
		handle = "@" + handle
	}
	handle = strings.ToLower(handle)
	if len(handle) < 2 {
		return nil, errors.New("юзернейм канала должен содержать как минимум 1 символ")
	}

	avatarURL := strings.TrimSpace(req.AvatarURL)
	if avatarURL == "" {
		avatarURL = "/static/avatars/default_channel.svg"
	}
	bannerURL := strings.TrimSpace(req.BannerURL)
	desc := strings.TrimSpace(req.Description)

	var channelID int
	query := `
		INSERT INTO channels (creator_id, name, handle, description, avatar_url, banner_url, subscribers_count)
		VALUES ($1, $2, $3, $4, $5, $6, 1)
		RETURNING id
	`
	err := r.db.QueryRow(query, creatorID, name, handle, desc, avatarURL, bannerURL).Scan(&channelID)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate key") {
			return nil, errors.New("канал с таким юзернеймом уже существует")
		}
		return nil, fmt.Errorf("create channel: %w", err)
	}

	// Создатель канала автоматически становится участником с ролью 'creator'
	_, _ = r.db.Exec(`
		INSERT INTO channel_members (channel_id, user_id, role)
		VALUES ($1, $2, 'creator')
		ON CONFLICT (channel_id, user_id) DO NOTHING
	`, channelID, creatorID)

	return r.GetChannelByID(channelID, creatorID)
}

func (r *ChannelRepository) GetChannelByID(channelID, currentUserID int) (*models.Channel, error) {
	query := `
		SELECT c.id, c.creator_id, c.name, c.handle, c.description, c.avatar_url, c.banner_url,
		       c.subscribers_count, c.created_at,
		       u.id, u.username, u.display_name, u.avatar_url,
		       EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2) AS is_subscribed
		FROM channels c
		JOIN users u ON c.creator_id = u.id
		WHERE c.id = $1
	`
	var ch models.Channel
	var creator models.User
	var isSubscribed bool

	err := r.db.QueryRow(query, channelID, currentUserID).Scan(
		&ch.ID, &ch.CreatorID, &ch.Name, &ch.Handle, &ch.Description, &ch.AvatarURL, &ch.BannerURL,
		&ch.SubscribersCount, &ch.CreatedAt,
		&creator.ID, &creator.Username, &creator.DisplayName, &creator.AvatarURL,
		&isSubscribed,
	)
	if err != nil {
		return nil, err
	}

	ch.Creator = &creator
	ch.IsCreator = (currentUserID > 0 && ch.CreatorID == currentUserID)
	ch.IsSubscribed = isSubscribed
	if ch.IsCreator {
		ch.Role = "creator"
	} else if isSubscribed {
		ch.Role = "member"
	}

	return &ch, nil
}

func (r *ChannelRepository) GetChannelByHandle(handle string, currentUserID int) (*models.Channel, error) {
	if !strings.HasPrefix(handle, "@") {
		handle = "@" + handle
	}
	handle = strings.ToLower(strings.TrimSpace(handle))

	var channelID int
	err := r.db.QueryRow("SELECT id FROM channels WHERE LOWER(handle) = $1", handle).Scan(&channelID)
	if err != nil {
		return nil, err
	}
	return r.GetChannelByID(channelID, currentUserID)
}

func (r *ChannelRepository) ListChannels(currentUserID int, filter string) ([]models.Channel, error) {
	baseQuery := `
		SELECT c.id, c.creator_id, c.name, c.handle, c.description, c.avatar_url, c.banner_url,
		       c.subscribers_count, c.created_at,
		       u.id, u.username, u.display_name, u.avatar_url,
		       EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1) AS is_subscribed
		FROM channels c
		JOIN users u ON c.creator_id = u.id
	`

	var rows *sql.Rows
	var err error

	if filter == "my" && currentUserID > 0 {
		query := baseQuery + ` WHERE c.creator_id = $1 ORDER BY c.created_at DESC`
		rows, err = r.db.Query(query, currentUserID)
	} else if filter == "subscribed" && currentUserID > 0 {
		query := baseQuery + ` WHERE EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1) ORDER BY c.subscribers_count DESC, c.created_at DESC`
		rows, err = r.db.Query(query, currentUserID)
	} else {
		query := baseQuery + ` ORDER BY c.subscribers_count DESC, c.created_at DESC LIMIT 100`
		rows, err = r.db.Query(query, currentUserID)
	}

	if err != nil {
		return nil, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()

	var channels []models.Channel
	for rows.Next() {
		var ch models.Channel
		var creator models.User
		var isSubscribed bool

		err := rows.Scan(
			&ch.ID, &ch.CreatorID, &ch.Name, &ch.Handle, &ch.Description, &ch.AvatarURL, &ch.BannerURL,
			&ch.SubscribersCount, &ch.CreatedAt,
			&creator.ID, &creator.Username, &creator.DisplayName, &creator.AvatarURL,
			&isSubscribed,
		)
		if err != nil {
			return nil, err
		}

		ch.Creator = &creator
		ch.IsCreator = (currentUserID > 0 && ch.CreatorID == currentUserID)
		ch.IsSubscribed = isSubscribed
		channels = append(channels, ch)
	}

	return channels, nil
}

func (r *ChannelRepository) UpdateChannel(channelID, userID int, req models.UpdateChannelRequest) (*models.Channel, error) {
	// Проверяем права: только создатель
	var creatorID int
	err := r.db.QueryRow("SELECT creator_id FROM channels WHERE id = $1", channelID).Scan(&creatorID)
	if err != nil {
		return nil, errors.New("канал не найден")
	}
	if creatorID != userID {
		return nil, errors.New("только создатель канала может изменять его оформление")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("название канала не может быть пустым")
	}

	query := `
		UPDATE channels
		SET name = $1,
		    description = $2,
		    avatar_url = CASE WHEN $3 != '' THEN $3 ELSE avatar_url END,
		    banner_url = $4
		WHERE id = $5
	`
	_, err = r.db.Exec(query, name, strings.TrimSpace(req.Description), strings.TrimSpace(req.AvatarURL), strings.TrimSpace(req.BannerURL), channelID)
	if err != nil {
		return nil, fmt.Errorf("update channel: %w", err)
	}

	return r.GetChannelByID(channelID, userID)
}

func (r *ChannelRepository) Subscribe(channelID, userID int) error {
	_, err := r.db.Exec(`
		INSERT INTO channel_members (channel_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (channel_id, user_id) DO NOTHING
	`, channelID, userID)
	if err != nil {
		return err
	}

	// Синхронизируем счетчик участников
	_, _ = r.db.Exec(`
		UPDATE channels
		SET subscribers_count = (SELECT count(1) FROM channel_members WHERE channel_id = $1)
		WHERE id = $1
	`, channelID)

	return nil
}

func (r *ChannelRepository) Unsubscribe(channelID, userID int) error {
	// Не позволяем создателю отписаться от своего канала
	var creatorID int
	err := r.db.QueryRow("SELECT creator_id FROM channels WHERE id = $1", channelID).Scan(&creatorID)
	if err == nil && creatorID == userID {
		return errors.New("создатель не может отписаться от собственного канала")
	}

	_, err = r.db.Exec(`
		DELETE FROM channel_members
		WHERE channel_id = $1 AND user_id = $2
	`, channelID, userID)
	if err != nil {
		return err
	}

	_, _ = r.db.Exec(`
		UPDATE channels
		SET subscribers_count = (SELECT count(1) FROM channel_members WHERE channel_id = $1)
		WHERE id = $1
	`, channelID)

	return nil
}

func (r *ChannelRepository) GetSubscribersCount(channelID int) (int, error) {
	var count int
	err := r.db.QueryRow("SELECT count(1) FROM channel_members WHERE channel_id = $1", channelID).Scan(&count)
	return count, err
}

func (r *ChannelRepository) DeleteChannel(channelID, userID int) error {
	var creatorID int
	err := r.db.QueryRow("SELECT creator_id FROM channels WHERE id = $1", channelID).Scan(&creatorID)
	if err != nil {
		return errors.New("канал не найден")
	}
	if creatorID != userID {
		return errors.New("только создатель может удалить канал")
	}

	_, err = r.db.Exec("DELETE FROM channels WHERE id = $1", channelID)
	return err
}

// GetChannelConversations возвращает список входящих диалогов от подписчиков к каналу
func (r *ChannelRepository) GetChannelConversations(channelID, userID int) ([]models.ChannelConversation, error) {
	var creatorID int
	err := r.db.QueryRow("SELECT creator_id FROM channels WHERE id = $1", channelID).Scan(&creatorID)
	if err != nil || creatorID != userID {
		return nil, errors.New("доступ запрещен: только создатель канала может просматривать сообщения")
	}

	ch, err := r.GetChannelByID(channelID, userID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT DISTINCT ON (sub_id)
		       u.id, u.username, u.display_name, u.avatar_url,
		       m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.is_read, m.is_from_channel,
		       (
		           SELECT count(1)
		           FROM messages unread
		           WHERE unread.channel_id = $1
		             AND unread.sender_id = u.id
		             AND unread.is_from_channel = FALSE
		             AND unread.is_read = FALSE
		       ) AS unread_count
		FROM (
		    SELECT CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END AS sub_id,
		           id, sender_id, receiver_id, content, created_at, is_read, is_from_channel
		    FROM messages
		    WHERE channel_id = $1
		) m
		JOIN users u ON u.id = m.sub_id
		ORDER BY sub_id, m.created_at DESC
	`

	rows, err := r.db.Query(query, channelID, creatorID)
	if err != nil {
		return nil, fmt.Errorf("channel convs: %w", err)
	}
	defer rows.Close()

	var convs []models.ChannelConversation
	for rows.Next() {
		var u models.User
		var m models.Message
		var unread int

		err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
			&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.CreatedAt, &m.IsRead, &m.IsFromChannel,
			&unread,
		)
		if err != nil {
			return nil, err
		}

		convs = append(convs, models.ChannelConversation{
			Channel:     *ch,
			Subscriber:  u,
			User:        &u,
			UserID:      u.ID,
			LastMessage: &m,
			LastText:    m.Content,
			UnreadCount: unread,
		})
	}

	return convs, nil
}
