package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"social-network/internal/models"
)

// CryptoRepository репозиторий управления криптографическими ключами пользователей.
type CryptoRepository struct {
	db *sql.DB
}

// NewCryptoRepository создает новый экземпляр CryptoRepository.
func NewCryptoRepository(db *sql.DB) *CryptoRepository {
	return &CryptoRepository{db: db}
}

// GetKeys возвращает публичные ключи пользователя.
func (r *CryptoRepository) GetKeys(userID int) (*models.UserCryptoKeys, error) {
	query := `
		SELECT user_id, public_key_ed25519, public_key_x25519, key_fingerprint, created_at, updated_at
		FROM user_crypto_keys
		WHERE user_id = $1
	`
	var keys models.UserCryptoKeys
	err := r.db.QueryRow(query, userID).Scan(
		&keys.UserID,
		&keys.PublicKeyEd25519,
		&keys.PublicKeyX25519,
		&keys.KeyFingerprint,
		&keys.CreatedAt,
		&keys.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get crypto keys for user %d: %w", userID, err)
	}
	return &keys, nil
}

// UpsertKeys сохраняет или обновляет публичные ключи пользователя.
func (r *CryptoRepository) UpsertKeys(userID int, ed25519Pub, x25519Pub, fingerprint string) error {
	query := `
		INSERT INTO user_crypto_keys (user_id, public_key_ed25519, public_key_x25519, key_fingerprint, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id) DO UPDATE SET
			public_key_ed25519 = EXCLUDED.public_key_ed25519,
			public_key_x25519 = EXCLUDED.public_key_x25519,
			key_fingerprint = EXCLUDED.key_fingerprint,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.db.Exec(query, userID, ed25519Pub, x25519Pub, fingerprint, time.Now())
	if err != nil {
		return fmt.Errorf("failed to upsert crypto keys for user %d: %w", userID, err)
	}
	return nil
}
