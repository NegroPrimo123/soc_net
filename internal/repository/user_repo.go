package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"

	"social-network/internal/models"

	"golang.org/x/crypto/bcrypt"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) GetAll(currentUserID int) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
	FROM users u
	ORDER BY u.id ASC
	`
	rows, err := r.db.Query(query, currentUserID)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
		); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetByID(id int, currentUserID int) (*models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
	FROM users u
	WHERE u.id = $2
	`
	var u models.User
	err := r.db.QueryRow(query, currentUserID, id).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.CreatedAt,
		&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) UpdateProfile(userID int, displayName, bio, avatarURL, bannerURL string) (*models.User, error) {
	query := `
	UPDATE users
	SET display_name = $1, bio = $2, avatar_url = $3, banner_url = $4
	WHERE id = $5
	`
	_, err := r.db.Exec(query, displayName, bio, avatarURL, bannerURL, userID)
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return r.GetByID(userID, userID)
}

func (r *UserRepository) GetFollowers(userID, currentUserID int) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
	FROM follows f
	JOIN users u ON u.id = f.follower_id
	WHERE f.following_id = $2
	ORDER BY f.created_at DESC
	`
	rows, err := r.db.Query(query, currentUserID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetFollowing(userID, currentUserID int) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
	FROM follows f
	JOIN users u ON u.id = f.following_id
	WHERE f.follower_id = $2
	ORDER BY f.created_at DESC
	`
	rows, err := r.db.Query(query, currentUserID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) ToggleFollow(followerID, followingID int) (bool, error) {
	if followerID == followingID {
		return false, fmt.Errorf("users cannot follow themselves")
	}

	var exists bool
	err := r.db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2)",
		followerID, followingID,
	).Scan(&exists)
	if err != nil {
		return false, err
	}

	if exists {
		_, err := r.db.Exec("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", followerID, followingID)
		return false, err
	} else {
		_, err := r.db.Exec("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)", followerID, followingID)
		return true, err
	}
}

func (r *UserRepository) CreateUser(username, displayName, password, avatarURL, bio string) (*models.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	if avatarURL == "" {
		avatarURL = fmt.Sprintf("https://api.dicebear.com/7.x/bottts/svg?seed=%s", username)
	}

	query := `
	INSERT INTO users (username, display_name, password_hash, avatar_url, bio)
	VALUES ($1, $2, $3, $4, $5)
	RETURNING id, username, display_name, avatar_url, bio, created_at
	`
	var u models.User
	err = r.db.QueryRow(query, username, displayName, string(hash), avatarURL, bio).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) Authenticate(username, password string) (*models.User, error) {
	query := `
	SELECT id, username, display_name, password_hash, avatar_url, bio, created_at
	FROM users
	WHERE LOWER(username) = LOWER($1)
	`
	var u models.User
	var passwordHash string
	err := r.db.QueryRow(query, username).Scan(
		&u.ID, &u.Username, &u.DisplayName, &passwordHash, &u.AvatarURL, &u.Bio, &u.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("пользователь с таким логином не найден")
	}
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("неверный пароль")
	}

	return &u, nil
}

func (r *UserRepository) CreateSession(userID int) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	query := `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`
	_, err := r.db.Exec(query, token, userID)
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

func (r *UserRepository) GetUserBySession(token string) (*models.User, error) {
	if token == "" {
		return nil, nil
	}

	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio, u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count
	FROM sessions s
	JOIN users u ON u.id = s.user_id
	WHERE s.token = $1 AND s.expires_at > NOW()
	`
	var u models.User
	err := r.db.QueryRow(query, token).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.CreatedAt,
		&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepository) DeleteSession(token string) error {
	_, err := r.db.Exec("DELETE FROM sessions WHERE token = $1", token)
	return err
}

