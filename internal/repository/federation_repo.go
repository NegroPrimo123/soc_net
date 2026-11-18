package repository

import (
	"database/sql"
	"fmt"
	"time"

	"social-network/internal/models"
)

// FederationRepository репозиторий децентрализованных узлов сети.
type FederationRepository struct {
	db *sql.DB
}

// NewFederationRepository создает репозиторий federation.
func NewFederationRepository(db *sql.DB) *FederationRepository {
	return &FederationRepository{db: db}
}

// GetNodes возвращает список всех известных узлов сети.
func (r *FederationRepository) GetNodes() ([]models.FederationNode, error) {
	query := `
		SELECT id, node_name, node_url, public_key_ed25519, status, ping_ms, synced_posts_count, last_sync_at, created_at
		FROM federation_nodes
		ORDER BY status ASC, ping_ms ASC, id ASC
	`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query federation nodes: %w", err)
	}
	defer rows.Close()

	var nodes []models.FederationNode
	for rows.Next() {
		var n models.FederationNode
		if err := rows.Scan(
			&n.ID,
			&n.NodeName,
			&n.NodeURL,
			&n.PublicKeyEd25519,
			&n.Status,
			&n.PingMs,
			&n.SyncedPostsCount,
			&n.LastSyncAt,
			&n.CreatedAt,
		); err != nil {
			continue
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

// AddNode регистрирует новый узел федерации.
func (r *FederationRepository) AddNode(name, url, pubKey string) (*models.FederationNode, error) {
	query := `
		INSERT INTO federation_nodes (node_name, node_url, public_key_ed25519, status, ping_ms, last_sync_at)
		VALUES ($1, $2, $3, 'online', 15, $4)
		ON CONFLICT (node_url) DO UPDATE SET
			node_name = EXCLUDED.node_name,
			public_key_ed25519 = EXCLUDED.public_key_ed25519,
			status = 'online',
			last_sync_at = EXCLUDED.last_sync_at
		RETURNING id, node_name, node_url, public_key_ed25519, status, ping_ms, synced_posts_count, last_sync_at, created_at
	`
	var n models.FederationNode
	err := r.db.QueryRow(query, name, url, pubKey, time.Now()).Scan(
		&n.ID,
		&n.NodeName,
		&n.NodeURL,
		&n.PublicKeyEd25519,
		&n.Status,
		&n.PingMs,
		&n.SyncedPostsCount,
		&n.LastSyncAt,
		&n.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to add federation node: %w", err)
	}
	return &n, nil
}

// UpdateNodePing обновляет задержку и статус узла.
func (r *FederationRepository) UpdateNodePing(nodeURL string, pingMs int, status string) error {
	query := `
		UPDATE federation_nodes 
		SET ping_ms = $1, status = $2, last_sync_at = $3
		WHERE node_url = $4
	`
	_, err := r.db.Exec(query, pingMs, status, time.Now(), nodeURL)
	return err
}
