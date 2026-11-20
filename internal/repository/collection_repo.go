package repository

import (
	"database/sql"
	"fmt"
	"time"

	"social-network/internal/models"
)

type CollectionRepository struct {
	db *sql.DB
}

func NewCollectionRepository(db *sql.DB) *CollectionRepository {
	return &CollectionRepository{db: db}
}

// CreateCollection создает новую подборку / коллекцию постов.
func (r *CollectionRepository) CreateCollection(userID int, req *models.CreateCollectionRequest) (*models.PostCollection, error) {
	if req.Title == "" {
		return nil, fmt.Errorf("название подборки обязательно")
	}

	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}

	query := `
		INSERT INTO post_collections (user_id, title, description, cover_url, is_public, posts_count, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	var col models.PostCollection
	col.UserID = userID
	col.Title = req.Title
	col.Description = req.Description
	col.CoverURL = req.CoverURL
	col.IsPublic = isPublic
	col.PostsCount = 0

	err := r.db.QueryRow(query, userID, req.Title, req.Description, req.CoverURL, isPublic).
		Scan(&col.ID, &col.CreatedAt, &col.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create collection: %w", err)
	}

	return &col, nil
}

// GetUserCollections возвращает список коллекций пользователя. Если не владелец, возвращаются только публичные.
func (r *CollectionRepository) GetUserCollections(targetUserID int, viewerUserID int) ([]models.PostCollection, error) {
	isOwner := (targetUserID == viewerUserID)
	query := `
		SELECT 
			c.id, c.user_id, c.title, COALESCE(c.description, ''), COALESCE(c.cover_url, ''),
			c.is_public, c.posts_count, c.created_at, c.updated_at,
			u.id, u.username, u.display_name, u.avatar_url
		FROM post_collections c
		JOIN users u ON u.id = c.user_id
		WHERE c.user_id = $1 AND ($2 = TRUE OR c.is_public = TRUE)
		ORDER BY c.updated_at DESC, c.id DESC
	`
	rows, err := r.db.Query(query, targetUserID, isOwner)
	if err != nil {
		return nil, fmt.Errorf("query user collections: %w", err)
	}
	defer rows.Close()

	var collections []models.PostCollection
	for rows.Next() {
		var c models.PostCollection
		var u models.User
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.Title, &c.Description, &c.CoverURL,
			&c.IsPublic, &c.PostsCount, &c.CreatedAt, &c.UpdatedAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
		); err != nil {
			return nil, fmt.Errorf("scan collection: %w", err)
		}
		c.User = &u

		// Если у подборки нет обложки, но есть посты, возьмем превью первого поста с фото
		if c.CoverURL == "" && c.PostsCount > 0 {
			var previewURL sql.NullString
			_ = r.db.QueryRow(`
				SELECT p.content FROM collection_posts cp
				JOIN posts p ON p.id = cp.post_id
				WHERE cp.collection_id = $1
				ORDER BY cp.added_at DESC LIMIT 1
			`, c.ID).Scan(&previewURL)
		}

		collections = append(collections, c)
	}

	if collections == nil {
		collections = []models.PostCollection{}
	}
	return collections, nil
}

// GetCollectionByID возвращает детальную информацию о коллекции и список сохраненных постов.
func (r *CollectionRepository) GetCollectionByID(collectionID, viewerUserID int) (*models.CollectionDetail, error) {
	colQuery := `
		SELECT 
			c.id, c.user_id, c.title, COALESCE(c.description, ''), COALESCE(c.cover_url, ''),
			c.is_public, c.posts_count, c.created_at, c.updated_at,
			u.id, u.username, u.display_name, u.avatar_url
		FROM post_collections c
		JOIN users u ON u.id = c.user_id
		WHERE c.id = $1
	`
	var c models.PostCollection
	var u models.User
	err := r.db.QueryRow(colQuery, collectionID).Scan(
		&c.ID, &c.UserID, &c.Title, &c.Description, &c.CoverURL,
		&c.IsPublic, &c.PostsCount, &c.CreatedAt, &c.UpdatedAt,
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
	)
	if err != nil {
		return nil, fmt.Errorf("коллекция не найдена: %w", err)
	}
	c.User = &u

	// Проверка приватности
	if !c.IsPublic && c.UserID != viewerUserID {
		return nil, fmt.Errorf("это приватная подборка, доступная только автору")
	}

	// Получение постов коллекции
	postsQuery := `
		SELECT 
			p.id, p.user_id, p.content, p.created_at, 
			COALESCE(p.likes_count, 0), COALESCE(p.comments_count, 0),
			COALESCE(p.is_edited, FALSE), p.updated_at,
			COALESCE(p.music_url, ''), COALESCE(p.music_title, ''), COALESCE(p.music_artist, ''),
			p.channel_id, p.poll_id,
			pu.id, pu.username, pu.display_name, pu.avatar_url, pu.bio,
			COALESCE(pu.status_text, ''), COALESCE(pu.status_emoji, ''), COALESCE(pu.custom_rank, ''),
			COALESCE(pu.accent_color, '#00f0ff'), COALESCE(pu.avatar_frame, 'default'), COALESCE(pu.profile_bg_effect, 'none'),
			EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $2) as is_liked,
			cp.added_at
		FROM collection_posts cp
		JOIN posts p ON p.id = cp.post_id
		JOIN users pu ON pu.id = p.user_id
		WHERE cp.collection_id = $1
		ORDER BY cp.added_at DESC
	`
	rows, err := r.db.Query(postsQuery, collectionID, viewerUserID)
	if err != nil {
		return nil, fmt.Errorf("query collection posts: %w", err)
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var p models.Post
		var pu models.User
		var addedAt time.Time
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.CreatedAt,
			&p.LikesCount, &p.CommentsCount,
			&p.IsEdited, &p.UpdatedAt,
			&p.MusicURL, &p.MusicTitle, &p.MusicArtist,
			&p.ChannelID, &p.PollID,
			&pu.ID, &pu.Username, &pu.DisplayName, &pu.AvatarURL, &pu.Bio,
			&pu.StatusText, &pu.StatusEmoji, &pu.CustomRank,
			&pu.AccentColor, &pu.AvatarFrame, &pu.ProfileBgEffect,
			&p.IsLiked,
			&addedAt,
		); err != nil {
			return nil, fmt.Errorf("scan collection post: %w", err)
		}
		p.User = pu
		posts = append(posts, p)
	}

	if posts == nil {
		posts = []models.Post{}
	}

	return &models.CollectionDetail{
		Collection: c,
		Posts:      posts,
	}, nil
}

// UpdateCollection обновляет метаданные коллекции.
func (r *CollectionRepository) UpdateCollection(collectionID, userID int, req *models.UpdateCollectionRequest) error {
	query := `
		UPDATE post_collections
		SET title = COALESCE(NULLIF($1, ''), title),
		    description = COALESCE($2, description),
		    cover_url = COALESCE(NULLIF($3, ''), cover_url),
		    is_public = COALESCE($4, is_public),
		    updated_at = NOW()
		WHERE id = $5 AND user_id = $6
	`
	res, err := r.db.Exec(query, req.Title, req.Description, req.CoverURL, req.IsPublic, collectionID, userID)
	if err != nil {
		return fmt.Errorf("update collection: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("коллекция не найдена или нет прав на редактирование")
	}
	return nil
}

// DeleteCollection удаляет коллекцию.
func (r *CollectionRepository) DeleteCollection(collectionID, userID int) error {
	res, err := r.db.Exec(`DELETE FROM post_collections WHERE id = $1 AND user_id = $2`, collectionID, userID)
	if err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("коллекция не найдена или нет прав на удаление")
	}
	return nil
}

// AddPostToCollection сохраняет пост в коллекцию.
func (r *CollectionRepository) AddPostToCollection(collectionID, postID, userID int) error {
	// Проверяем, что коллекция принадлежит текущему пользователю
	var exists bool
	err := r.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM post_collections WHERE id = $1 AND user_id = $2)`, collectionID, userID).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("коллекция не найдена")
	}

	// Проверяем существование поста
	var postExists bool
	err = r.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1)`, postID).Scan(&postExists)
	if err != nil || !postExists {
		return fmt.Errorf("пост не найден")
	}

	res, err := r.db.Exec(`
		INSERT INTO collection_posts (collection_id, post_id, added_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (collection_id, post_id) DO NOTHING
	`, collectionID, postID)
	if err != nil {
		return fmt.Errorf("add post to collection: %w", err)
	}

	rows, _ := res.RowsAffected()
	if rows > 0 {
		_, _ = r.db.Exec(`
			UPDATE post_collections 
			SET posts_count = (SELECT COUNT(*) FROM collection_posts WHERE collection_id = $1),
			    updated_at = NOW()
			WHERE id = $1
		`, collectionID)
	}

	return nil
}

// RemovePostFromCollection удаляет пост из коллекции.
func (r *CollectionRepository) RemovePostFromCollection(collectionID, postID, userID int) error {
	// Проверяем право на коллекцию
	var exists bool
	err := r.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM post_collections WHERE id = $1 AND user_id = $2)`, collectionID, userID).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("коллекция не найдена")
	}

	_, err = r.db.Exec(`DELETE FROM collection_posts WHERE collection_id = $1 AND post_id = $2`, collectionID, postID)
	if err != nil {
		return fmt.Errorf("remove post from collection: %w", err)
	}

	_, _ = r.db.Exec(`
		UPDATE post_collections 
		SET posts_count = (SELECT COUNT(*) FROM collection_posts WHERE collection_id = $1),
		    updated_at = NOW()
		WHERE id = $1
	`, collectionID)

	return nil
}

// GetPostCollectionsStatus возвращает все коллекции пользователя с флагом is_saved для конкретного поста.
func (r *CollectionRepository) GetPostCollectionsStatus(postID, userID int) ([]models.PostCollection, error) {
	query := `
		SELECT 
			c.id, c.user_id, c.title, COALESCE(c.description, ''), COALESCE(c.cover_url, ''),
			c.is_public, c.posts_count, c.created_at, c.updated_at,
			EXISTS(SELECT 1 FROM collection_posts cp WHERE cp.collection_id = c.id AND cp.post_id = $2) as is_saved
		FROM post_collections c
		WHERE c.user_id = $1
		ORDER BY c.updated_at DESC, c.id DESC
	`
	rows, err := r.db.Query(query, userID, postID)
	if err != nil {
		return nil, fmt.Errorf("query post collections status: %w", err)
	}
	defer rows.Close()

	var collections []models.PostCollection
	for rows.Next() {
		var c models.PostCollection
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.Title, &c.Description, &c.CoverURL,
			&c.IsPublic, &c.PostsCount, &c.CreatedAt, &c.UpdatedAt,
			&c.IsSaved,
		); err != nil {
			return nil, fmt.Errorf("scan collection status: %w", err)
		}
		collections = append(collections, c)
	}

	if collections == nil {
		collections = []models.PostCollection{}
	}
	return collections, nil
}
