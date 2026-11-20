package repository

import (
	"database/sql"
	"fmt"

	"social-network/internal/models"
)

type BlockRepository struct {
	db *sql.DB
}

func NewBlockRepository(db *sql.DB) *BlockRepository {
	return &BlockRepository{db: db}
}

// BlockUser добавляет пользователя в черный список.
func (r *BlockRepository) BlockUser(blockerID, blockedID int) error {
	if blockerID == blockedID {
		return fmt.Errorf("нельзя заблокировать самого себя")
	}

	_, err := r.db.Exec(`
		INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (blocker_id, blocked_id) DO NOTHING
	`, blockerID, blockedID)
	if err != nil {
		return fmt.Errorf("block user: %w", err)
	}
	return nil
}

// UnblockUser удаляет пользователя из черного списка.
func (r *BlockRepository) UnblockUser(blockerID, blockedID int) error {
	res, err := r.db.Exec(`
		DELETE FROM user_blocks 
		WHERE blocker_id = $1 AND blocked_id = $2
	`, blockerID, blockedID)
	if err != nil {
		return fmt.Errorf("unblock user: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("пользователь не найден в черном списке")
	}
	return nil
}

// IsUserBlocked проверяет, заблокирован ли blockedID пользователем blockerID.
func (r *BlockRepository) IsUserBlocked(blockerID, blockedID int) (bool, error) {
	var exists bool
	err := r.db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM user_blocks 
			WHERE blocker_id = $1 AND blocked_id = $2
		)
	`, blockerID, blockedID).Scan(&exists)
	return exists, err
}

// IsCommunicationBlocked проверяет, заблокирована ли связь между двумя пользователями (в любую сторону).
func (r *BlockRepository) IsCommunicationBlocked(user1, user2 int) (bool, error) {
	var exists bool
	err := r.db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM user_blocks 
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)
	`, user1, user2).Scan(&exists)
	return exists, err
}

// GetBlacklist возвращает список заблокированных пользователей для текущего пользователя.
func (r *BlockRepository) GetBlacklist(blockerID int) ([]models.User, error) {
	query := `
		SELECT 
			u.id, u.username, u.display_name, u.avatar_url, u.bio,
			COALESCE(u.status_text, ''), COALESCE(u.custom_rank, ''), COALESCE(u.accent_color, '#00f0ff')
		FROM user_blocks ub
		JOIN users u ON u.id = ub.blocked_id
		WHERE ub.blocker_id = $1
		ORDER BY ub.created_at DESC
	`
	rows, err := r.db.Query(query, blockerID)
	if err != nil {
		return nil, fmt.Errorf("query blacklist: %w", err)
	}
	defer rows.Close()

	var blockedUsers []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio,
			&u.StatusText, &u.CustomRank, &u.AccentColor,
		); err != nil {
			return nil, fmt.Errorf("scan blocked user: %w", err)
		}
		blockedUsers = append(blockedUsers, u)
	}

	if blockedUsers == nil {
		blockedUsers = []models.User{}
	}
	return blockedUsers, nil
}
