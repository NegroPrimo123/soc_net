package repository

import (
	"database/sql"
	"fmt"

	"social-network/internal/models"
)

type GiftRepository struct {
	db *sql.DB
}

func NewGiftRepository(db *sql.DB) *GiftRepository {
	return &GiftRepository{db: db}
}

func (r *GiftRepository) SendGift(req *models.SendGiftRequest) (*models.Gift, error) {
	var giftID int
	query := `
	INSERT INTO gifts (sender_id, receiver_id, gift_type, message, is_anonymous, is_hidden)
	VALUES ($1, $2, $3, $4, $5, FALSE)
	RETURNING id
	`
	err := r.db.QueryRow(query, req.SenderID, req.ReceiverID, req.GiftType, req.Message, req.IsAnonymous).Scan(&giftID)
	if err != nil {
		return nil, fmt.Errorf("send gift: %w", err)
	}

	return r.GetGiftByID(giftID)
}

func (r *GiftRepository) GetGiftByID(id int) (*models.Gift, error) {
	query := `
	SELECT 
		g.id, g.sender_id, g.receiver_id, g.gift_type, g.message, g.is_anonymous, COALESCE(g.is_hidden, FALSE), g.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM gifts g
	LEFT JOIN users u ON u.id = g.sender_id
	WHERE g.id = $1
	`
	var g models.Gift
	var senderID sql.NullInt64
	var uID sql.NullInt64
	var uUsername, uDisplayName, uAvatar, uBio sql.NullString

	err := r.db.QueryRow(query, id).Scan(
		&g.ID, &senderID, &g.ReceiverID, &g.GiftType, &g.Message, &g.IsAnonymous, &g.IsHidden, &g.CreatedAt,
		&uID, &uUsername, &uDisplayName, &uAvatar, &uBio,
	)
	if err != nil {
		return nil, err
	}

	if senderID.Valid {
		sid := int(senderID.Int64)
		g.SenderID = &sid
		if !g.IsAnonymous && uID.Valid {
			g.Sender = &models.User{
				ID:          int(uID.Int64),
				Username:    uUsername.String,
				DisplayName: uDisplayName.String,
				AvatarURL:   uAvatar.String,
				Bio:         uBio.String,
			}
		}
	}

	return &g, nil
}

func (r *GiftRepository) GetByReceiverID(receiverID int, includeHidden bool) ([]models.Gift, error) {
	query := `
	SELECT 
		g.id, g.sender_id, g.receiver_id, g.gift_type, g.message, g.is_anonymous, COALESCE(g.is_hidden, FALSE), g.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM gifts g
	LEFT JOIN users u ON u.id = g.sender_id
	WHERE g.receiver_id = $1
	`
	if !includeHidden {
		query += " AND COALESCE(g.is_hidden, FALSE) = FALSE "
	}
	query += " ORDER BY g.created_at DESC"

	rows, err := r.db.Query(query, receiverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var gifts []models.Gift
	for rows.Next() {
		var g models.Gift
		var senderID sql.NullInt64
		var uID sql.NullInt64
		var uUsername, uDisplayName, uAvatar, uBio sql.NullString

		if err := rows.Scan(
			&g.ID, &senderID, &g.ReceiverID, &g.GiftType, &g.Message, &g.IsAnonymous, &g.IsHidden, &g.CreatedAt,
			&uID, &uUsername, &uDisplayName, &uAvatar, &uBio,
		); err != nil {
			return nil, err
		}

		if senderID.Valid {
			sid := int(senderID.Int64)
			g.SenderID = &sid
			if !g.IsAnonymous && uID.Valid {
				g.Sender = &models.User{
					ID:          int(uID.Int64),
					Username:    uUsername.String,
					DisplayName: uDisplayName.String,
					AvatarURL:   uAvatar.String,
					Bio:         uBio.String,
				}
			}
		}

		gifts = append(gifts, g)
	}
	return gifts, nil
}

func (r *GiftRepository) GetAllShowcase(limit int) ([]models.Gift, error) {
	query := `
	SELECT 
		g.id, g.sender_id, g.receiver_id, g.gift_type, g.message, g.is_anonymous, COALESCE(g.is_hidden, FALSE), g.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM gifts g
	LEFT JOIN users u ON u.id = g.sender_id
	WHERE COALESCE(g.is_hidden, FALSE) = FALSE
	ORDER BY g.created_at DESC
	LIMIT $1
	`
	rows, err := r.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var gifts []models.Gift
	for rows.Next() {
		var g models.Gift
		var senderID sql.NullInt64
		var uID sql.NullInt64
		var uUsername, uDisplayName, uAvatar, uBio sql.NullString

		if err := rows.Scan(
			&g.ID, &senderID, &g.ReceiverID, &g.GiftType, &g.Message, &g.IsAnonymous, &g.IsHidden, &g.CreatedAt,
			&uID, &uUsername, &uDisplayName, &uAvatar, &uBio,
		); err != nil {
			return nil, err
		}

		if senderID.Valid {
			sid := int(senderID.Int64)
			g.SenderID = &sid
			if !g.IsAnonymous && uID.Valid {
				g.Sender = &models.User{
					ID:          int(uID.Int64),
					Username:    uUsername.String,
					DisplayName: uDisplayName.String,
					AvatarURL:   uAvatar.String,
					Bio:         uBio.String,
				}
			}
		}

		gifts = append(gifts, g)
	}
	return gifts, nil
}

// ToggleHide позволяет получателю подарка скрыть или отобразить его в своем публичном профиле
func (r *GiftRepository) ToggleHide(giftID, receiverID int) (bool, error) {
	query := `
	UPDATE gifts
	SET is_hidden = NOT COALESCE(is_hidden, FALSE)
	WHERE id = $1 AND receiver_id = $2
	RETURNING is_hidden
	`
	var isHidden bool
	err := r.db.QueryRow(query, giftID, receiverID).Scan(&isHidden)
	if err != nil {
		return false, fmt.Errorf("подарок не найден или вы не являетесь его получателем: %w", err)
	}
	return isHidden, nil
}
