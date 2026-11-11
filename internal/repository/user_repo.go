package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"

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
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
	FROM users u
	ORDER BY u.id ASC
	LIMIT 50
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
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
			&u.StatusText, &u.StatusEmoji, &u.CustomRank,
			&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
			&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
			&u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
			&u.ExperiencePoints, &u.AccountLevel,
		); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) Search(currentUserID int, search string) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
	FROM users u
	WHERE LOWER(u.username) LIKE LOWER($2) OR LOWER(u.display_name) LIKE LOWER($2)
	ORDER BY u.id ASC
	LIMIT 20
	`
	rows, err := r.db.Query(query, currentUserID, "%"+search+"%")
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
			&u.StatusText, &u.StatusEmoji, &u.CustomRank,
			&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
			&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
			&u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
			&u.ExperiencePoints, &u.AccountLevel,
		); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetByID(id int, currentUserID int) (*models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
	FROM users u
	WHERE u.id = $2
	`
	var u models.User
	err := r.db.QueryRow(query, currentUserID, id).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
		&u.StatusText, &u.StatusEmoji, &u.CustomRank,
		&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
		&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
		&u.CreatedAt,
		&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
		&u.ExperiencePoints, &u.AccountLevel,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
	return &u, nil
}

func (r *UserRepository) UpdateProfile(userID int, req models.UpdateProfileRequest) (*models.User, error) {
	if req.AccentColor == "" {
		req.AccentColor = "#00f0ff"
	}
	if req.AvatarFrame == "" {
		req.AvatarFrame = "default"
	}
	if req.ProfileBgEffect == "" {
		req.ProfileBgEffect = "none"
	}

	query := `
	UPDATE users
	SET display_name = $1, bio = $2, avatar_url = $3, banner_url = $4,
	    status_text = $5, status_emoji = $6, custom_rank = $7,
	    accent_color = $8, avatar_frame = $9, profile_bg_effect = $10,
	    skills_tags = $11, social_links = $12, pinned_gift_id = $13,
	    music_url = $14, music_title = $15, music_artist = $16
	WHERE id = $17
	`
	_, err := r.db.Exec(query,
		req.DisplayName, req.Bio, req.AvatarURL, req.BannerURL,
		req.StatusText, req.StatusEmoji, req.CustomRank,
		req.AccentColor, req.AvatarFrame, req.ProfileBgEffect,
		req.SkillsTags, req.SocialLinks, req.PinnedGiftID,
		req.MusicURL, req.MusicTitle, req.MusicArtist,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return r.GetByID(userID, userID)
}

func (r *UserRepository) GetFollowers(userID, currentUserID int) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
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
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
			&u.StatusText, &u.StatusEmoji, &u.CustomRank,
			&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
			&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
			&u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
			&u.ExperiencePoints, &u.AccountLevel,
		); err != nil {
			return nil, err
		}
		u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetFollowing(userID, currentUserID int) ([]models.User, error) {
	query := `
	SELECT 
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
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
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
			&u.StatusText, &u.StatusEmoji, &u.CustomRank,
			&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
			&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
			&u.CreatedAt,
			&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount, &u.IsFollowing,
			&u.ExperiencePoints, &u.AccountLevel,
		); err != nil {
			return nil, err
		}
		u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
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
		switch strings.ToLower(username) {
		case "oleg":
			avatarURL = "/static/avatars/oleg.svg"
		case "alex":
			avatarURL = "/static/avatars/alex.svg"
		case "sophia":
			avatarURL = "/static/avatars/sophia.svg"
		default:
			avatarURL = "/static/avatars/default.svg"
		}
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
	WHERE LOWER(username) = LOWER($1) OR (LOWER($1) IN ('итаква', 'ithaqua', 'itakwa') AND LOWER(username) = 'itakwa')
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
		u.id, u.username, u.display_name, u.avatar_url, COALESCE(u.banner_url, ''), u.bio,
		COALESCE(u.status_text, ''), COALESCE(u.status_emoji, ''), COALESCE(u.custom_rank, ''),
		COALESCE(u.accent_color, '#00f0ff'), COALESCE(u.avatar_frame, 'default'), COALESCE(u.profile_bg_effect, 'none'),
		COALESCE(u.skills_tags, ''), COALESCE(u.social_links, ''), COALESCE(u.pinned_gift_id, 0),
		COALESCE(u.music_url, ''), COALESCE(u.music_title, ''), COALESCE(u.music_artist, ''),
		u.created_at,
		(SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
		(SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
		(SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
		(SELECT COUNT(*) FROM gifts WHERE receiver_id = u.id) as gifts_count,
		COALESCE(u.experience_points, 0) as experience_points,
		COALESCE(u.account_level, 1) as account_level
	FROM sessions s
	JOIN users u ON u.id = s.user_id
	WHERE s.token = $1 AND s.expires_at > NOW()
	`
	var u models.User
	err := r.db.QueryRow(query, token).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio,
		&u.StatusText, &u.StatusEmoji, &u.CustomRank,
		&u.AccentColor, &u.AvatarFrame, &u.ProfileBgEffect,
		&u.SkillsTags, &u.SocialLinks, &u.PinnedGiftID, &u.MusicURL, &u.MusicTitle, &u.MusicArtist,
		&u.CreatedAt,
		&u.PostsCount, &u.Followers, &u.Following, &u.GiftsCount,
		&u.ExperiencePoints, &u.AccountLevel,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.LevelTitle = models.CalculateLevel(u.ExperiencePoints).Title
	return &u, nil
}

func (r *UserRepository) DeleteSession(token string) error {
	_, err := r.db.Exec("DELETE FROM sessions WHERE token = $1", token)
	return err
}

func (r *UserRepository) GetUserMusic(userID int) ([]models.UserMusic, error) {
	query := `
	SELECT id, user_id, url, title, COALESCE(artist, ''), COALESCE(position, 0), created_at
	FROM user_music
	WHERE user_id = $1
	ORDER BY position ASC, id DESC
	`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("get user music: %w", err)
	}
	defer rows.Close()

	var tracks []models.UserMusic
	for rows.Next() {
		var m models.UserMusic
		if err := rows.Scan(&m.ID, &m.UserID, &m.URL, &m.Title, &m.Artist, &m.Position, &m.CreatedAt); err != nil {
			return nil, err
		}
		tracks = append(tracks, m)
	}
	if tracks == nil {
		tracks = []models.UserMusic{}
	}
	return tracks, nil
}

func (r *UserRepository) AddUserMusic(userID int, url, title, artist string) (*models.UserMusic, error) {
	// Сдвигаем текущие позиции существующих треков
	_, _ = r.db.Exec("UPDATE user_music SET position = position + 1 WHERE user_id = $1", userID)

	query := `
	INSERT INTO user_music (user_id, url, title, artist, position)
	VALUES ($1, $2, $3, $4, 0)
	RETURNING id, user_id, url, title, artist, position, created_at
	`
	var m models.UserMusic
	err := r.db.QueryRow(query, userID, url, title, artist).Scan(
		&m.ID, &m.UserID, &m.URL, &m.Title, &m.Artist, &m.Position, &m.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("add user music: %w", err)
	}

	// Новый трек на позиции 0 становится лицевым
	_, _ = r.db.Exec(`
	UPDATE users SET music_url = $1, music_title = $2, music_artist = $3
	WHERE id = $4
	`, url, title, artist, userID)

	return &m, nil
}

func (r *UserRepository) ReorderUserMusic(userID int, trackIDs []int) ([]models.UserMusic, error) {
	if len(trackIDs) == 0 {
		return r.GetUserMusic(userID)
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	for pos, id := range trackIDs {
		_, err := tx.Exec("UPDATE user_music SET position = $1 WHERE id = $2 AND user_id = $3", pos, id, userID)
		if err != nil {
			return nil, err
		}
	}

	// Первый трек (trackIDs[0]) теперь лицевой трек профиля
	var frontURL, frontTitle, frontArtist string
	err = tx.QueryRow(`
		SELECT url, title, COALESCE(artist, '')
		FROM user_music
		WHERE id = $1 AND user_id = $2
	`, trackIDs[0], userID).Scan(&frontURL, &frontTitle, &frontArtist)
	if err == nil {
		_, _ = tx.Exec(`
			UPDATE users SET music_url = $1, music_title = $2, music_artist = $3 WHERE id = $4
		`, frontURL, frontTitle, frontArtist, userID)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetUserMusic(userID)
}

func (r *UserRepository) DeleteUserMusic(musicID, userID int) error {
	_, err := r.db.Exec("DELETE FROM user_music WHERE id = $1 AND user_id = $2", musicID, userID)
	if err != nil {
		return fmt.Errorf("delete user music: %w", err)
	}

	// Обновляем лицевой трек на верхний оставшийся (position ASC, id DESC)
	var latest models.UserMusic
	err = r.db.QueryRow(`
	SELECT url, title, COALESCE(artist, '')
	FROM user_music
	WHERE user_id = $1
	ORDER BY position ASC, id DESC
	LIMIT 1
	`, userID).Scan(&latest.URL, &latest.Title, &latest.Artist)

	if err == sql.ErrNoRows {
		// Больше нет треков
		_, _ = r.db.Exec("UPDATE users SET music_url = '', music_title = '', music_artist = '' WHERE id = $1", userID)
	} else if err == nil {
		_, _ = r.db.Exec("UPDATE users SET music_url = $1, music_title = $2, music_artist = $3 WHERE id = $4",
			latest.URL, latest.Title, latest.Artist, userID)
	}

	return nil
}
