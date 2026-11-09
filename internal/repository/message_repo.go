package repository

import (
	"database/sql"

	"fmt"

	"time"

	"github.com/lib/pq"

	"social-network/internal/models"
)

type MessageRepository struct {
	db *sql.DB
}

func NewMessageRepository(db *sql.DB) *MessageRepository {

	return &MessageRepository{db: db}

}

func (r *MessageRepository) SendMessage(senderID, receiverID int, content, audioURL, audioTitle, audioArtist string) (*models.Message, error) {
	if senderID == receiverID {
		return nil, fmt.Errorf("нельзя отправить сообщение самому себе")
	}

	var exists bool
	err := r.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", receiverID).Scan(&exists)
	if err != nil || !exists {
		return nil, fmt.Errorf("получатель не найден")
	}

	query := `
	INSERT INTO messages (sender_id, receiver_id, content, audio_url, audio_title, audio_artist, is_read, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
	RETURNING id, created_at
	`
	var msgID int
	var createdAt time.Time
	err = r.db.QueryRow(query, senderID, receiverID, content, audioURL, audioTitle, audioArtist).Scan(&msgID, &createdAt)

	if err != nil {

		return nil, fmt.Errorf("send message: %w", err)

	}

	return r.GetMessageByID(msgID)

}

func (r *MessageRepository) GetMessageByID(msgID int) (*models.Message, error) {

	query := `

	SELECT 

		m.id, m.sender_id, m.receiver_id, m.content, COALESCE(m.audio_url, ''), COALESCE(m.audio_title, ''), COALESCE(m.audio_artist, ''), m.is_read, COALESCE(m.is_edited, FALSE), m.created_at,

		s.id, s.username, s.display_name, s.avatar_url, s.bio,

		rc.id, rc.username, rc.display_name, rc.avatar_url, rc.bio

	FROM messages m

	JOIN users s ON s.id = m.sender_id

	JOIN users rc ON rc.id = m.receiver_id

	WHERE m.id = $1

	`

	var m models.Message

	var s, rc models.User

	err := r.db.QueryRow(query, msgID).Scan(

		&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.AudioURL, &m.AudioTitle, &m.AudioArtist, &m.IsRead, &m.IsEdited, &m.CreatedAt,

		&s.ID, &s.Username, &s.DisplayName, &s.AvatarURL, &s.Bio,

		&rc.ID, &rc.Username, &rc.DisplayName, &rc.AvatarURL, &rc.Bio,
	)

	if err != nil {

		return nil, err

	}

	m.Sender = &s
	m.Receiver = &rc
	m.Reactions = []models.MessageReaction{}
	reactionsMap, err := r.GetReactionsForMessages([]int{msgID}, 0)
	if err == nil && len(reactionsMap[msgID]) > 0 {
		m.Reactions = reactionsMap[msgID]
	}
	return &m, nil

}

func (r *MessageRepository) GetConversation(currentUserID, otherUserID int, limit int) ([]models.Message, error) {

	if limit <= 0 {

		limit = 100

	}

	query := `
	SELECT * FROM (
		SELECT 
			m.id, m.sender_id, m.receiver_id, m.content, COALESCE(m.audio_url, ''), COALESCE(m.audio_title, ''), COALESCE(m.audio_artist, ''), m.is_read, COALESCE(m.is_edited, FALSE), m.created_at,
		s.id, s.username, s.display_name, s.avatar_url, s.bio,
		rc.id, rc.username, rc.display_name, rc.avatar_url, rc.bio
		FROM messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users rc ON rc.id = m.receiver_id
		WHERE ((m.sender_id = $1 AND m.receiver_id = $2 AND COALESCE(m.deleted_for_sender, FALSE) = FALSE)
		   OR  (m.sender_id = $2 AND m.receiver_id = $1 AND COALESCE(m.deleted_for_receiver, FALSE) = FALSE))
		ORDER BY m.created_at DESC
		LIMIT $3
	) sub
	ORDER BY sub.created_at ASC
	`

	rows, err := r.db.Query(query, currentUserID, otherUserID, limit)

	if err != nil {

		return nil, fmt.Errorf("query conversation: %w", err)

	}

	defer rows.Close()

	var messages []models.Message
	var msgIDs []int

	for rows.Next() {

		var m models.Message

		var s, rc models.User

		if err := rows.Scan(

			&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.AudioURL, &m.AudioTitle, &m.AudioArtist, &m.IsRead, &m.IsEdited, &m.CreatedAt,

			&s.ID, &s.Username, &s.DisplayName, &s.AvatarURL, &s.Bio,

			&rc.ID, &rc.Username, &rc.DisplayName, &rc.AvatarURL, &rc.Bio,
		); err != nil {

			return nil, fmt.Errorf("scan message: %w", err)

		}

		m.Sender = &s
		m.Receiver = &rc
		m.Reactions = []models.MessageReaction{}
		messages = append(messages, m)
		msgIDs = append(msgIDs, m.ID)
	}

	if len(msgIDs) > 0 {
		reactionsMap, err := r.GetReactionsForMessages(msgIDs, currentUserID)
		if err == nil {
			for i := range messages {
				if reacts, ok := reactionsMap[messages[i].ID]; ok {
					messages[i].Reactions = reacts
				}
			}
		}
	}

	return messages, nil

}

func (r *MessageRepository) MarkAsRead(currentUserID, senderID int) error {

	query := `

	UPDATE messages

	SET is_read = TRUE

	WHERE receiver_id = $1 AND sender_id = $2 AND is_read = FALSE

	`

	_, err := r.db.Exec(query, currentUserID, senderID)

	return err

}

func (r *MessageRepository) GetConversationsList(currentUserID int) ([]models.Conversation, error) {

	query := `

	SELECT 

		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,

		m.id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at, m.audio_url, m.audio_title,

		(SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = $1 AND is_read = FALSE AND COALESCE(deleted_for_receiver, FALSE) = FALSE) AS unread_count

	FROM users u

	JOIN LATERAL (

		SELECT id, sender_id, receiver_id, content, is_read, created_at, COALESCE(audio_url, '') AS audio_url, COALESCE(audio_title, '') AS audio_title

		FROM messages

		WHERE ((sender_id = $1 AND receiver_id = u.id AND COALESCE(deleted_for_sender, FALSE) = FALSE)

		    OR (sender_id = u.id AND receiver_id = $1 AND COALESCE(deleted_for_receiver, FALSE) = FALSE))

		ORDER BY created_at DESC

		LIMIT 1

	) m ON TRUE

	WHERE u.id != $1

	ORDER BY m.created_at DESC

	`

	rows, err := r.db.Query(query, currentUserID)

	if err != nil {

		return nil, fmt.Errorf("query conversations list: %w", err)

	}

	defer rows.Close()

	var conversations []models.Conversation

	for rows.Next() {

		var c models.Conversation

		var m models.Message

		var msgID, senderID, receiverID sql.NullInt64

		var content sql.NullString

		var isRead sql.NullBool
		var msgCreatedAt sql.NullTime
		var audioURL, audioTitle sql.NullString

		if err := rows.Scan(

			&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.BannerURL, &c.User.Bio, &c.User.CreatedAt,

			&msgID, &senderID, &receiverID, &content, &isRead, &msgCreatedAt, &audioURL, &audioTitle,

			&c.UnreadCount,
		); err != nil {

			return nil, fmt.Errorf("scan conversation: %w", err)

		}

		if msgID.Valid {

			m.ID = int(msgID.Int64)

			m.SenderID = int(senderID.Int64)

			m.ReceiverID = int(receiverID.Int64)

			m.Content = content.String

			m.IsRead = isRead.Bool

			m.CreatedAt = msgCreatedAt.Time

			c.LastMessage = &m

		}

		conversations = append(conversations, c)

	}

	return conversations, nil

}

func (r *MessageRepository) GetUnreadCount(currentUserID int) (int, error) {

	var count int

	query := `SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE`

	err := r.db.QueryRow(query, currentUserID).Scan(&count)

	return count, err

}

func (r *MessageRepository) UpdateMessage(msgID, senderID int, content string) (*models.Message, error) {

	query := `

	UPDATE messages

	SET content = $1, is_edited = TRUE, updated_at = NOW()

	WHERE id = $2 AND sender_id = $3

	`

	res, err := r.db.Exec(query, content, msgID, senderID)

	if err != nil {

		return nil, fmt.Errorf("update message: %w", err)

	}

	rows, _ := res.RowsAffected()

	if rows == 0 {

		return nil, fmt.Errorf("сообщение не найдено или у вас нет прав на его редактирование")

	}

	return r.GetMessageByID(msgID)

}

func (r *MessageRepository) DeleteMessage(msgID, userID int, forEveryone bool) error {

	if forEveryone {

		query := `DELETE FROM messages WHERE id = $1 AND sender_id = $2`

		res, err := r.db.Exec(query, msgID, userID)

		if err != nil {

			return fmt.Errorf("delete message for everyone: %w", err)

		}

		rows, _ := res.RowsAffected()

		if rows == 0 {

			return fmt.Errorf("сообщение не найдено или только автор может удалить его для всех")

		}

		return nil

	}

	query := `

	UPDATE messages

	SET 

		deleted_for_sender = CASE WHEN sender_id = $2 THEN TRUE ELSE deleted_for_sender END,

		deleted_for_receiver = CASE WHEN receiver_id = $2 THEN TRUE ELSE deleted_for_receiver END

	WHERE id = $1 AND (sender_id = $2 OR receiver_id = $2)

	`

	res, err := r.db.Exec(query, msgID, userID)

	if err != nil {

		return fmt.Errorf("delete message for self: %w", err)

	}

	rows, _ := res.RowsAffected()

	if rows == 0 {

		return fmt.Errorf("сообщение не найдено")

	}

	_, _ = r.db.Exec("DELETE FROM messages WHERE id = $1 AND deleted_for_sender = TRUE AND deleted_for_receiver = TRUE", msgID)

	return nil

}

func (r *MessageRepository) BatchDeleteMessages(msgIDs []int, userID int, forEveryone bool) (int, error) {

	if len(msgIDs) == 0 {

		return 0, nil

	}

	if forEveryone {

		query := `DELETE FROM messages WHERE id = ANY($1) AND sender_id = $2`

		res, err := r.db.Exec(query, pq.Array(msgIDs), userID)

		if err != nil {

			return 0, fmt.Errorf("batch delete for everyone: %w", err)

		}

		rows, _ := res.RowsAffected()

		return int(rows), nil

	}

	query := `

	UPDATE messages

	SET 

		deleted_for_sender = CASE WHEN sender_id = $2 THEN TRUE ELSE deleted_for_sender END,

		deleted_for_receiver = CASE WHEN receiver_id = $2 THEN TRUE ELSE deleted_for_receiver END

	WHERE id = ANY($1) AND (sender_id = $2 OR receiver_id = $2)

	`

	res, err := r.db.Exec(query, pq.Array(msgIDs), userID)

	if err != nil {

		return 0, fmt.Errorf("batch delete for self: %w", err)

	}

	rows, _ := res.RowsAffected()

	_, _ = r.db.Exec("DELETE FROM messages WHERE id = ANY($1) AND deleted_for_sender = TRUE AND deleted_for_receiver = TRUE", pq.Array(msgIDs))

	return int(rows), nil

}

func (r *MessageRepository) GetReactionsForMessages(messageIDs []int, currentUserID int) (map[int][]models.MessageReaction, error) {
	result := make(map[int][]models.MessageReaction)
	if len(messageIDs) == 0 {
		return result, nil
	}

	query := `
	SELECT 
		mr.message_id,
		mr.emoji,
		COUNT(*) as count,
		BOOL_OR(mr.user_id = $2) as user_reacted,
		COALESCE(ARRAY_AGG(u.display_name ORDER BY mr.created_at ASC), '{}') as users
	FROM message_reactions mr
	JOIN users u ON u.id = mr.user_id
	WHERE mr.message_id = ANY($1)
	GROUP BY mr.message_id, mr.emoji
	ORDER BY COUNT(*) DESC, mr.emoji ASC
	`
	rows, err := r.db.Query(query, pq.Array(messageIDs), currentUserID)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var msgID int
		var react models.MessageReaction
		if err := rows.Scan(&msgID, &react.Emoji, &react.Count, &react.UserReacted, pq.Array(&react.Users)); err != nil {
			continue
		}
		result[msgID] = append(result[msgID], react)
	}
	return result, nil
}

func (r *MessageRepository) ToggleMessageReaction(messageID, userID int, emoji string) ([]models.MessageReaction, error) {
	var exists bool
	err := r.db.QueryRow("SELECT EXISTS(SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3)", messageID, userID, emoji).Scan(&exists)
	if err != nil {
		return nil, err
	}

	if exists {
		_, err = r.db.Exec("DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3", messageID, userID, emoji)
	} else {
		_, err = r.db.Exec("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id, emoji) DO NOTHING", messageID, userID, emoji)
	}
	if err != nil {
		return nil, err
	}

	reactionsMap, err := r.GetReactionsForMessages([]int{messageID}, userID)
	if err != nil {
		return nil, err
	}
	reactions := reactionsMap[messageID]
	if reactions == nil {
		reactions = []models.MessageReaction{}
	}
	return reactions, nil
}
