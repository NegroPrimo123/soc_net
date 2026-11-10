package repository

import (
	"database/sql"

	"fmt"

	"time"
	"strings"

	"github.com/lib/pq"

	"math"
	"social-network/internal/models"
)

type MessageRepository struct {
	db *sql.DB
}

func NewMessageRepository(db *sql.DB) *MessageRepository {

	return &MessageRepository{db: db}

}

func (r *MessageRepository) SendMessage(senderID, receiverID int, content, audioURL, audioTitle, audioArtist string, channelID *int, isFromChannel bool, pollID *int) (*models.Message, error) {
	if channelID == nil && senderID == receiverID {
		return nil, fmt.Errorf("нельзя отправить сообщение самому себе")
	}

	if channelID != nil && !isFromChannel {
		// Сообщение каналу от пользователя: получателем ставим создателя канала
		var creatorID int
		err := r.db.QueryRow("SELECT creator_id FROM channels WHERE id = $1", *channelID).Scan(&creatorID)
		if err != nil {
			return nil, fmt.Errorf("канал не найден: %w", err)
		}
		receiverID = creatorID
	} else if channelID == nil {
		var exists bool
		err := r.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", receiverID).Scan(&exists)
		if err != nil || !exists {
			return nil, fmt.Errorf("получатель не найден")
		}
	}

	query := `
	INSERT INTO messages (sender_id, receiver_id, content, audio_url, audio_title, audio_artist, channel_id, is_from_channel, poll_id, is_read, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, NOW())
	RETURNING id, created_at
	`
	var msgID int
	var createdAt time.Time
	err := r.db.QueryRow(query, senderID, receiverID, content, audioURL, audioTitle, audioArtist, channelID, isFromChannel, pollID).Scan(&msgID, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("send message: %w", err)
	}

	return r.GetMessageByID(msgID)
}

func (r *MessageRepository) GetMessageByID(msgID int) (*models.Message, error) {
	query := `
	SELECT 
		m.id, m.sender_id, m.receiver_id, m.content, COALESCE(m.audio_url, ''), COALESCE(m.audio_title, ''), COALESCE(m.audio_artist, ''), m.is_read, COALESCE(m.is_edited, FALSE), m.created_at,
		m.channel_id, COALESCE(m.is_from_channel, FALSE), m.poll_id,
		s.id, s.username, s.display_name, s.avatar_url, s.bio,
		rc.id, rc.username, rc.display_name, rc.avatar_url, rc.bio,
		COALESCE(ch.name, ''), COALESCE(ch.handle, ''), COALESCE(ch.avatar_url, '')
	FROM messages m
	JOIN users s ON s.id = m.sender_id
	JOIN users rc ON rc.id = m.receiver_id
	LEFT JOIN channels ch ON ch.id = m.channel_id
	WHERE m.id = $1
	`

	var m models.Message
	var s, rc models.User
	var chName, chHandle, chAvatar string

	err := r.db.QueryRow(query, msgID).Scan(
		&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.AudioURL, &m.AudioTitle, &m.AudioArtist, &m.IsRead, &m.IsEdited, &m.CreatedAt,
		&m.ChannelID, &m.IsFromChannel, &m.PollID,
		&s.ID, &s.Username, &s.DisplayName, &s.AvatarURL, &s.Bio,
		&rc.ID, &rc.Username, &rc.DisplayName, &rc.AvatarURL, &rc.Bio,
		&chName, &chHandle, &chAvatar,
	)
	if err != nil {
		return nil, err
	}

	m.Sender = &s
	m.Receiver = &rc
	if m.IsFromChannel && m.ChannelID != nil {
		m.Sender = &models.User{
			ID:          0,
			Username:    chHandle,
			DisplayName: chName,
			AvatarURL:   chAvatar,
		}
	}
	if m.ChannelID != nil {
		m.Channel = &models.Channel{
			ID:        *m.ChannelID,
			Name:      chName,
			Handle:    chHandle,
			AvatarURL: chAvatar,
		}
	}

	m.Reactions = []models.MessageReaction{}
	reactionsMap, err := r.GetReactionsForMessages([]int{msgID}, 0)
	if err == nil && len(reactionsMap[msgID]) > 0 {
		m.Reactions = reactionsMap[msgID]
	}

	msgSlice := []models.Message{m}
	r.attachPollsToMessages(msgSlice, 0)
	m = msgSlice[0]

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
			m.channel_id, COALESCE(m.is_from_channel, FALSE), m.poll_id,
			s.id, s.username, s.display_name, s.avatar_url, s.bio,
			rc.id, rc.username, rc.display_name, rc.avatar_url, rc.bio
		FROM messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users rc ON rc.id = m.receiver_id
		WHERE ((m.sender_id = $1 AND m.receiver_id = $2 AND COALESCE(m.deleted_for_sender, FALSE) = FALSE)
		   OR  (m.sender_id = $2 AND m.receiver_id = $1 AND COALESCE(m.deleted_for_receiver, FALSE) = FALSE))
		   AND m.channel_id IS NULL
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
			&m.ChannelID, &m.IsFromChannel, &m.PollID,
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

	r.attachPollsToMessages(messages, currentUserID)
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

		AND channel_id IS NULL
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

func (r *MessageRepository) UpdateMessage(msgID, senderID int, content string, audioURL, audioTitle, audioArtist *string) (*models.Message, error) {
	hasAudioUpdate := (audioURL != nil)
	valAudioURL := ""
	valAudioTitle := ""
	valAudioArtist := ""
	if audioURL != nil {
		valAudioURL = *audioURL
	}
	if audioTitle != nil {
		valAudioTitle = *audioTitle
	}
	if audioArtist != nil {
		valAudioArtist = *audioArtist
	}

	query := `
	UPDATE messages
	SET content = $1,
	    audio_url = CASE WHEN $2::boolean THEN $3 ELSE audio_url END,
	    audio_title = CASE WHEN $2::boolean THEN $4 ELSE audio_title END,
	    audio_artist = CASE WHEN $2::boolean THEN $5 ELSE audio_artist END,
	    is_edited = TRUE,
	    updated_at = NOW()
	WHERE id = $6 AND sender_id = $7
	`
	res, err := r.db.Exec(query, content, hasAudioUpdate, valAudioURL, valAudioTitle, valAudioArtist, msgID, senderID)
	if err != nil {
		return nil, fmt.Errorf("update message: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("сообщение не найдено или у вас нет прав на его редактирование")
	}

	msg, err := r.GetMessageByID(msgID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(msg.Content) == "" && strings.TrimSpace(msg.AudioURL) == "" {
		return nil, fmt.Errorf("сообщение не может быть пустым")
	}

	return msg, nil
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


func (r *MessageRepository) attachPollsToMessages(messages []models.Message, currentUserID int) {
	if len(messages) == 0 {
		return
	}
	var pollIDs []int
	for _, m := range messages {
		if m.PollID != nil && *m.PollID > 0 {
			pollIDs = append(pollIDs, *m.PollID)
		}
	}
	if len(pollIDs) == 0 {
		return
	}

	rows, err := r.db.Query(`
		SELECT id, creator_id, question, is_multiple, is_anonymous, total_votes, created_at
		FROM polls WHERE id = ANY($1)
	`, pq.Array(pollIDs))
	if err != nil {
		return
	}
	defer rows.Close()

	pollsMap := make(map[int]*models.Poll)
	for rows.Next() {
		var poll models.Poll
		if err := rows.Scan(&poll.ID, &poll.CreatorID, &poll.Question, &poll.IsMultiple, &poll.IsAnonymous, &poll.TotalVotes, &poll.CreatedAt); err == nil {
			poll.Options = make([]models.PollOption, 0)
			poll.UserVotedOptionIDs = make([]int, 0)
			pollsMap[poll.ID] = &poll
		}
	}

	optRows, err := r.db.Query(`
		SELECT id, poll_id, text, votes_count
		FROM poll_options WHERE poll_id = ANY($1)
		ORDER BY id ASC
	`, pq.Array(pollIDs))
	if err == nil {
		defer optRows.Close()
		for optRows.Next() {
			var opt models.PollOption
			if err := optRows.Scan(&opt.ID, &opt.PollID, &opt.Text, &opt.VotesCount); err == nil {
				if poll, ok := pollsMap[opt.PollID]; ok {
					poll.Options = append(poll.Options, opt)
				}
			}
		}
	}

	if currentUserID > 0 {
		vRows, err := r.db.Query(`
			SELECT poll_id, option_id
			FROM poll_votes WHERE poll_id = ANY($1) AND user_id = $2
		`, pq.Array(pollIDs), currentUserID)
		if err == nil {
			defer vRows.Close()
			for vRows.Next() {
				var pID, oID int
				if err := vRows.Scan(&pID, &oID); err == nil {
					if poll, ok := pollsMap[pID]; ok {
						poll.UserVotedOptionIDs = append(poll.UserVotedOptionIDs, oID)
						poll.HasVoted = true
						for i := range poll.Options {
							if poll.Options[i].ID == oID {
								poll.Options[i].IsVoted = true
							}
						}
					}
				}
			}
		}
	}

	for _, poll := range pollsMap {
		for i := range poll.Options {
			opt := &poll.Options[i]
			if poll.TotalVotes > 0 {
				opt.Percentage = math.Round((float64(opt.VotesCount) / float64(poll.TotalVotes)) * 100)
			} else {
				opt.Percentage = 0
			}
		}
	}

	for i := range messages {
		if messages[i].PollID != nil {
			if poll, ok := pollsMap[*messages[i].PollID]; ok {
				messages[i].Poll = poll
			}
		}
	}
}

// GetChannelConversation возвращает анонимный диалог подписчика с каналом
func (r *MessageRepository) GetChannelConversation(channelID, subscriberID, currentUserID, limit int) ([]models.Message, error) {
	if limit <= 0 {
		limit = 100
	}

	query := `
	SELECT * FROM (
		SELECT 
			m.id, m.sender_id, m.receiver_id, m.content, COALESCE(m.audio_url, ''), COALESCE(m.audio_title, ''), COALESCE(m.audio_artist, ''), m.is_read, COALESCE(m.is_edited, FALSE), m.created_at,
			m.channel_id, COALESCE(m.is_from_channel, FALSE), m.poll_id,
			s.id, s.username, s.display_name, s.avatar_url, s.bio,
			rc.id, rc.username, rc.display_name, rc.avatar_url, rc.bio,
			ch.name, ch.handle, ch.avatar_url
		FROM messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users rc ON rc.id = m.receiver_id
		JOIN channels ch ON ch.id = m.channel_id
		WHERE m.channel_id = $1 
		  AND ((m.sender_id = $2 AND COALESCE(m.is_from_channel, FALSE) = FALSE)
		   OR  (m.receiver_id = $2 AND COALESCE(m.is_from_channel, FALSE) = TRUE))
		ORDER BY m.created_at DESC
		LIMIT $3
	) sub
	ORDER BY sub.created_at ASC
	`

	rows, err := r.db.Query(query, channelID, subscriberID, limit)
	if err != nil {
		return nil, fmt.Errorf("query channel conversation: %w", err)
	}
	defer rows.Close()

	var messages []models.Message
	var msgIDs []int

	for rows.Next() {
		var m models.Message
		var s, rc models.User
		var chName, chHandle, chAvatar string

		if err := rows.Scan(
			&m.ID, &m.SenderID, &m.ReceiverID, &m.Content, &m.AudioURL, &m.AudioTitle, &m.AudioArtist, &m.IsRead, &m.IsEdited, &m.CreatedAt,
			&m.ChannelID, &m.IsFromChannel, &m.PollID,
			&s.ID, &s.Username, &s.DisplayName, &s.AvatarURL, &s.Bio,
			&rc.ID, &rc.Username, &rc.DisplayName, &rc.AvatarURL, &rc.Bio,
			&chName, &chHandle, &chAvatar,
		); err != nil {
			return nil, fmt.Errorf("scan channel message: %w", err)
		}

		m.Sender = &s
		m.Receiver = &rc

		// Если сообщение отправлено от имени канала, скрываем реального отправителя
		if m.IsFromChannel {
			m.Sender = &models.User{
				ID:          0,
				Username:    chHandle,
				DisplayName: chName,
				AvatarURL:   chAvatar,
			}
		}

		m.Channel = &models.Channel{
			ID:        channelID,
			Name:      chName,
			Handle:    chHandle,
			AvatarURL: chAvatar,
		}

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

	r.attachPollsToMessages(messages, currentUserID)
	return messages, nil
}
