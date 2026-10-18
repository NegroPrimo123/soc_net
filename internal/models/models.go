package models

import "time"

type User struct {
	ID          int       `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	Bio         string    `json:"bio"`
	CreatedAt   time.Time `json:"created_at"`
	PostsCount  int       `json:"posts_count,omitempty"`
	Followers   int       `json:"followers_count,omitempty"`
	Following   int       `json:"following_count,omitempty"`
	IsFollowing bool      `json:"is_following,omitempty"`
}

type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"post_id"`
	UserID    int       `json:"user_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	User      User      `json:"user"`
}

type Post struct {
	ID            int       `json:"id"`
	UserID        int       `json:"user_id"`
	Content       string    `json:"content"`
	ImageURL      string    `json:"image_url"`
	IsEdited      bool      `json:"is_edited"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	User          User      `json:"user"`
	LikesCount    int       `json:"likes_count"`
	CommentsCount int       `json:"comments_count"`
	IsLiked       bool      `json:"is_liked"`
	Comments      []Comment `json:"comments,omitempty"`
}

type CreatePostRequest struct {
	UserID   int    `json:"user_id"`
	Content  string `json:"content"`
	ImageURL string `json:"image_url"`
}

type UpdatePostRequest struct {
	UserID  int    `json:"user_id"`
	Content string `json:"content"`
}

type CreateCommentRequest struct {
	UserID  int    `json:"user_id"`
	Content string `json:"content"`
}

type ToggleLikeRequest struct {
	UserID int `json:"user_id"`
}

type ToggleFollowRequest struct {
	FollowerID  int `json:"follower_id"`
	FollowingID int `json:"following_id"`
}

type RegisterRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
	Bio         string `json:"bio"`
	AvatarURL   string `json:"avatar_url"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthResponse struct {
	User  User   `json:"user"`
	Token string `json:"token"`
}
