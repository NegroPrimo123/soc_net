package models

import "time"

type User struct {
	ID int `json:"id"`

	Username string `json:"username"`

	DisplayName string `json:"display_name"`

	AvatarURL string `json:"avatar_url"`

	BannerURL string `json:"banner_url,omitempty"`

	Bio string `json:"bio"`

	StatusText string `json:"status_text"`

	StatusEmoji string `json:"status_emoji"`

	CustomRank string `json:"custom_rank"`

	AccentColor string `json:"accent_color"`

	AvatarFrame string `json:"avatar_frame"`

	ProfileBgEffect string `json:"profile_bg_effect"`

	SkillsTags string `json:"skills_tags"`

	SocialLinks string `json:"social_links"`

	PinnedGiftID int    `json:"pinned_gift_id"`
	MusicURL     string `json:"music_url,omitempty"`
	MusicTitle   string `json:"music_title,omitempty"`
	MusicArtist  string `json:"music_artist,omitempty"`

	CreatedAt time.Time `json:"created_at"`

	PostsCount int `json:"posts_count"`

	Followers int `json:"followers_count"`

	Following int `json:"following_count"`

	GiftsCount int `json:"gifts_count"`

	IsFollowing bool `json:"is_following,omitempty"`
}

type Gift struct {
	ID int `json:"id"`

	SenderID *int `json:"sender_id,omitempty"`

	ReceiverID int `json:"receiver_id"`

	GiftType string `json:"gift_type"`

	Message string `json:"message"`

	IsAnonymous bool `json:"is_anonymous"`

	IsHidden bool `json:"is_hidden"`

	CreatedAt time.Time `json:"created_at"`

	Sender *User `json:"sender,omitempty"`
}

type SendGiftRequest struct {
	SenderID int `json:"sender_id"`

	ReceiverID int `json:"receiver_id"`

	GiftType string `json:"gift_type"`

	Message string `json:"message"`

	IsAnonymous bool `json:"is_anonymous"`
}

type MessageReaction struct {
	Emoji       string   `json:"emoji"`
	Count       int      `json:"count"`
	UserReacted bool     `json:"user_reacted"`
	Users       []string `json:"users,omitempty"`
}

type ToggleReactionRequest struct {
	Emoji string `json:"emoji"`
}

type Message struct {
	ID                 int               `json:"id"`
	SenderID           int               `json:"sender_id"`
	ReceiverID         int               `json:"receiver_id"`
	Content            string            `json:"content"`
	IsRead             bool              `json:"is_read"`
	IsEdited           bool              `json:"is_edited"`
	DeletedForSender   bool              `json:"deleted_for_sender,omitempty"`
	DeletedForReceiver bool              `json:"deleted_for_receiver,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at,omitempty"`
	Sender             *User             `json:"sender,omitempty"`
	Receiver           *User             `json:"receiver,omitempty"`
	AudioURL           string            `json:"audio_url,omitempty"`
	AudioTitle         string            `json:"audio_title,omitempty"`
	AudioArtist        string            `json:"audio_artist,omitempty"`
	Reactions          []MessageReaction `json:"reactions,omitempty"`
}

type UpdateMessageRequest struct {
	Content string `json:"content"`
}

type DeleteMessageRequest struct {
	ForEveryone bool `json:"for_everyone"`
}

type BatchDeleteMessagesRequest struct {
	MessageIDs []int `json:"message_ids"`

	ForEveryone bool `json:"for_everyone"`
}

type Conversation struct {
	User User `json:"user"`

	LastMessage *Message `json:"last_message,omitempty"`

	UnreadCount int `json:"unread_count"`
}

type SendMessageRequest struct {
	ReceiverID int `json:"receiver_id"`

	Content     string `json:"content"`
	AudioURL    string `json:"audio_url,omitempty"`
	AudioTitle  string `json:"audio_title,omitempty"`
	AudioArtist string `json:"audio_artist,omitempty"`
}

type UpdateProfileRequest struct {
	DisplayName string `json:"display_name"`

	Bio string `json:"bio"`

	AvatarURL string `json:"avatar_url"`

	BannerURL string `json:"banner_url"`

	StatusText string `json:"status_text"`

	StatusEmoji string `json:"status_emoji"`

	CustomRank string `json:"custom_rank"`

	AccentColor string `json:"accent_color"`

	AvatarFrame string `json:"avatar_frame"`

	ProfileBgEffect string `json:"profile_bg_effect"`

	SkillsTags string `json:"skills_tags"`

	SocialLinks string `json:"social_links"`

	PinnedGiftID int    `json:"pinned_gift_id"`
	MusicURL     string `json:"music_url"`
	MusicTitle   string `json:"music_title"`
	MusicArtist  string `json:"music_artist"`
}

type Comment struct {
	ID int `json:"id"`

	PostID int `json:"post_id"`

	UserID int `json:"user_id"`

	Content string `json:"content"`

	IsEdited bool `json:"is_edited"`

	CreatedAt time.Time `json:"created_at"`

	UpdatedAt time.Time `json:"updated_at,omitempty"`

	User User `json:"user"`
}

type UpdateCommentRequest struct {
	Content string `json:"content"`
}

type Post struct {
	ID int `json:"id"`

	UserID int `json:"user_id"`

	Content string `json:"content"`

	ImageURL    string `json:"image_url"`
	MusicURL    string `json:"music_url,omitempty"`
	MusicTitle  string `json:"music_title,omitempty"`
	MusicArtist string `json:"music_artist,omitempty"`

	IsEdited bool `json:"is_edited"`

	CreatedAt time.Time `json:"created_at"`

	UpdatedAt time.Time `json:"updated_at"`

	User User `json:"user"`

	LikesCount int `json:"likes_count"`

	CommentsCount int `json:"comments_count"`

	IsLiked bool `json:"is_liked"`

	Comments []Comment `json:"comments,omitempty"`
}

type CreatePostRequest struct {
	UserID int `json:"user_id"`

	Content string `json:"content"`

	ImageURL    string `json:"image_url"`
	MusicURL    string `json:"music_url,omitempty"`
	MusicTitle  string `json:"music_title,omitempty"`
	MusicArtist string `json:"music_artist,omitempty"`
}

type UpdatePostRequest struct {
	UserID      int     `json:"user_id"`
	Content     string  `json:"content"`
	ImageURL    *string `json:"image_url,omitempty"`
	MusicURL    *string `json:"music_url,omitempty"`
	MusicTitle  *string `json:"music_title,omitempty"`
	MusicArtist *string `json:"music_artist,omitempty"`
}

type CreateCommentRequest struct {
	UserID int `json:"user_id"`

	Content string `json:"content"`
}

type ToggleLikeRequest struct {
	UserID int `json:"user_id"`
}

type ToggleFollowRequest struct {
	FollowerID int `json:"follower_id"`

	FollowingID int `json:"following_id"`
}

type RegisterRequest struct {
	Username string `json:"username"`

	DisplayName string `json:"display_name"`

	Password string `json:"password"`

	Bio string `json:"bio"`

	AvatarURL string `json:"avatar_url"`
}

type LoginRequest struct {
	Username string `json:"username"`

	Password string `json:"password"`
}

type AuthResponse struct {
	User User `json:"user"`

	Token string `json:"token"`
}

// Notification represents a single notification record

type Notification struct {
	ID int `json:"id"`

	UserID int `json:"user_id"`

	ActorID int `json:"actor_id"`

	ActionType string `json:"action_type"` // 'like', 'comment', 'follow', 'message', 'gift'

	TargetID int `json:"target_id"`

	Content string `json:"content"`

	IsRead bool `json:"is_read"`

	CreatedAt time.Time `json:"created_at"`

	Actor *User `json:"actor,omitempty"`
}

// GroupedNotification aggregates multiple notifications to eliminate noise

type GroupedNotification struct {
	GroupKey string `json:"group_key"`

	ActionType string `json:"action_type"`

	TargetID int `json:"target_id"`

	Title string `json:"title"`

	Snippet string `json:"snippet"`

	TotalCount int `json:"total_count"`

	Actors []User `json:"actors"`

	IsRead bool `json:"is_read"`

	LatestAt time.Time `json:"latest_at"`

	IDs []int `json:"ids"`
}

type MarkNotificationsReadRequest struct {
	IDs []int `json:"ids"`
}
