package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"social-network/internal/models"
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

func (r *PostRepository) GetFeed(currentUserID int, feedType, searchQuery, tagQuery string) ([]models.Post, error) {
	query := `
	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		(SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
		(SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked
	FROM posts p
	JOIN users u ON u.id = p.user_id
	WHERE 1=1
	`
	args := []interface{}{currentUserID}
	argIdx := 2

	if feedType == "following" {
		query += fmt.Sprintf(" AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1) OR p.user_id = $1)")
	}

	var isRankedSearch bool
	var searchArgIdx int

	if searchQuery != "" {
		isRankedSearch = true
		searchArgIdx = argIdx

		// Полнотекстовый поиск с морфологией (FTS) + Триграммы для поиска с опечатками (pg_trgm) + поиск по авторам
		query += fmt.Sprintf(` AND (
			p.search_vector @@ plainto_tsquery('russian', $%d)
			OR word_similarity($%d, p.content) > 0.25
			OR p.content ILIKE $%d
			OR u.username ILIKE $%d
			OR u.display_name ILIKE $%d
		)`, searchArgIdx, searchArgIdx, searchArgIdx+1, searchArgIdx+1, searchArgIdx+1)

		args = append(args, searchQuery, "%"+searchQuery+"%")
		argIdx += 2
	}

	if tagQuery != "" {
		cleanTag := strings.TrimPrefix(tagQuery, "#")
		query += fmt.Sprintf(` AND (
			p.content ILIKE $%d
			OR p.search_vector @@ plainto_tsquery('russian', $%d)
		)`, argIdx, argIdx+1)
		args = append(args, "%#"+cleanTag+"%", cleanTag)
		argIdx += 2
	}

	if isRankedSearch {
		// Ранжирование по релевантности: FTS ts_rank_cd + триграммная схожесть word_similarity
		query += fmt.Sprintf(` ORDER BY (
			ts_rank_cd(p.search_vector, plainto_tsquery('russian', $%d)) * 2.0 + 
			word_similarity($%d, p.content)
		) DESC, p.created_at DESC`, searchArgIdx, searchArgIdx)
	} else {
		query += " ORDER BY p.created_at DESC"
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("query feed: %w", err)
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var p models.Post
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
			&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
			&p.LikesCount, &p.CommentsCount, &p.IsLiked,
		); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}

		comments, err := r.GetComments(p.ID)
		if err == nil {
			p.Comments = comments
		} else {
			p.Comments = []models.Comment{}
		}

		posts = append(posts, p)
	}
	return posts, nil
}

func (r *PostRepository) GetPostsByUserID(authorID, currentUserID int) ([]models.Post, error) {
	query := `
	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		(SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
		(SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked
	FROM posts p
	JOIN users u ON u.id = p.user_id
	WHERE p.user_id = $2
	ORDER BY p.created_at DESC
	`
	rows, err := r.db.Query(query, currentUserID, authorID)
	if err != nil {
		return nil, fmt.Errorf("query user posts: %w", err)
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var p models.Post
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
			&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
			&p.LikesCount, &p.CommentsCount, &p.IsLiked,
		); err != nil {
			return nil, fmt.Errorf("scan user post: %w", err)
		}

		comments, err := r.GetComments(p.ID)
		if err == nil {
			p.Comments = comments
		} else {
			p.Comments = []models.Comment{}
		}

		posts = append(posts, p)
	}
	return posts, nil
}

func (r *PostRepository) CreatePost(userID int, content string, imageURL string) (*models.Post, error) {
	var postID int
	query := `INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING id`
	err := r.db.QueryRow(query, userID, content, imageURL).Scan(&postID)
	if err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}

	return r.GetPostByID(postID, userID)
}

func (r *PostRepository) UpdatePost(postID, userID int, content string) (*models.Post, error) {
	query := `
	UPDATE posts 
	SET content = $1, is_edited = TRUE, updated_at = NOW() 
	WHERE id = $2 AND (user_id = $3 OR $3 = 1) 
	RETURNING id
	`
	var updatedID int
	err := r.db.QueryRow(query, content, postID, userID).Scan(&updatedID)
	if err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}

	return r.GetPostByID(updatedID, userID)
}

func (r *PostRepository) GetPostByID(postID, currentUserID int) (*models.Post, error) {
	query := `
	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		(SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
		(SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked
	FROM posts p
	JOIN users u ON u.id = p.user_id
	WHERE p.id = $2
	`
	var p models.Post
	err := r.db.QueryRow(query, currentUserID, postID).Scan(
		&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
		&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
		&p.LikesCount, &p.CommentsCount, &p.IsLiked,
	)
	if err != nil {
		return nil, err
	}

	p.Comments, _ = r.GetComments(p.ID)
	return &p, nil
}

func (r *PostRepository) ToggleLike(userID, postID int) (bool, int, error) {
	var exists bool
	err := r.db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = $2)",
		userID, postID,
	).Scan(&exists)
	if err != nil {
		return false, 0, err
	}

	var isLiked bool
	if exists {
		_, err = r.db.Exec("DELETE FROM likes WHERE user_id = $1 AND post_id = $2", userID, postID)
		isLiked = false
	} else {
		_, err = r.db.Exec("INSERT INTO likes (user_id, post_id) VALUES ($1, $2)", userID, postID)
		isLiked = true
	}
	if err != nil {
		return false, 0, err
	}

	var count int
	err = r.db.QueryRow("SELECT COUNT(*) FROM likes WHERE post_id = $1", postID).Scan(&count)
	if err != nil {
		return false, 0, err
	}

	return isLiked, count, nil
}

func (r *PostRepository) GetComments(postID int) ([]models.Comment, error) {
	query := `
	SELECT 
		c.id, c.post_id, c.user_id, c.content, c.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM comments c
	JOIN users u ON u.id = c.user_id
	WHERE c.post_id = $1
	ORDER BY c.created_at ASC
	`
	rows, err := r.db.Query(query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(
			&c.ID, &c.PostID, &c.UserID, &c.Content, &c.CreatedAt,
			&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
		); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}

func (r *PostRepository) CreateComment(postID, userID int, content string) (*models.Comment, error) {
	var commentID int
	query := `INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id`
	err := r.db.QueryRow(query, postID, userID, content).Scan(&commentID)
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}

	queryComment := `
	SELECT 
		c.id, c.post_id, c.user_id, c.content, c.created_at,
		u.id, u.username, u.display_name, u.avatar_url, u.bio
	FROM comments c
	JOIN users u ON u.id = c.user_id
	WHERE c.id = $1
	`
	var c models.Comment
	err = r.db.QueryRow(queryComment, commentID).Scan(
		&c.ID, &c.PostID, &c.UserID, &c.Content, &c.CreatedAt,
		&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
	)
	if err != nil {
		return nil, err
	}

	return &c, nil
}

func (r *PostRepository) DeletePost(postID, userID int) error {
	query := `DELETE FROM posts WHERE id = $1 AND (user_id = $2 OR $2 = 1)`
	res, err := r.db.Exec(query, postID, userID)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("post not found or unauthorized")
	}
	return nil
}
