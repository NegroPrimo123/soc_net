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

	ExperiencePoints int    `json:"experience_points"`
	AccountLevel     int    `json:"account_level"`
	LevelTitle       string `json:"level_title,omitempty"`
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
	ChannelID          *int              `json:"channel_id,omitempty"`
	IsFromChannel      bool              `json:"is_from_channel"`
	Channel            *Channel          `json:"channel,omitempty"`
	PollID             *int              `json:"poll_id,omitempty"`
	Poll               *Poll             `json:"poll,omitempty"`
	Reactions          []MessageReaction `json:"reactions,omitempty"`
}

type UpdateMessageRequest struct {
	Content     string  `json:"content"`
	AudioURL    *string `json:"audio_url,omitempty"`
	AudioTitle  *string `json:"audio_title,omitempty"`
	AudioArtist *string `json:"audio_artist,omitempty"`
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
	ReceiverID    int    `json:"receiver_id"`
	Content       string `json:"content"`
	AudioURL      string `json:"audio_url,omitempty"`
	AudioTitle    string `json:"audio_title,omitempty"`
	AudioArtist   string `json:"audio_artist,omitempty"`
	ChannelID     *int   `json:"channel_id,omitempty"`
	IsFromChannel bool   `json:"is_from_channel,omitempty"`
	PollID        *int   `json:"poll_id,omitempty"`
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

	ChannelID   *int      `json:"channel_id,omitempty"`
	Channel     *Channel  `json:"channel,omitempty"`
	PollID      *int      `json:"poll_id,omitempty"`
	Poll        *Poll     `json:"poll,omitempty"`

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
	ChannelID   *int   `json:"channel_id,omitempty"`
	PollID      *int   `json:"poll_id,omitempty"`
}

type UpdatePostRequest struct {
	UserID      int     `json:"user_id"`
	Content     string  `json:"content"`
	ImageURL    *string `json:"image_url,omitempty"`
	MusicURL    *string `json:"music_url,omitempty"`
	MusicTitle  *string `json:"music_title,omitempty"`
	MusicArtist *string `json:"music_artist,omitempty"`
	PollID      *int    `json:"poll_id,omitempty"`
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

type UserMusic struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	URL       string    `json:"url"`
	Title     string    `json:"title"`
	Artist    string    `json:"artist"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
}

type ReorderUserMusicRequest struct {
	TrackIDs []int `json:"track_ids"`
}

type AddUserMusicRequest struct {
	URL    string `json:"url"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
}


// ==========================================
// CHANNELS (КАНАЛЫ)
// ==========================================
type Channel struct {
	ID               int       `json:"id"`
	CreatorID        int       `json:"creator_id"`
	Name             string    `json:"name"`
	Handle           string    `json:"handle"`
	Description      string    `json:"description"`
	AvatarURL        string    `json:"avatar_url"`
	BannerURL        string    `json:"banner_url"`
	SubscribersCount int       `json:"subscribers_count"`
	CreatedAt        time.Time `json:"created_at"`
	IsCreator        bool      `json:"is_creator,omitempty"`
	IsSubscribed     bool      `json:"is_subscribed,omitempty"`
	Role             string    `json:"role,omitempty"`
	Creator          *User     `json:"creator,omitempty"`
}

type ChannelMember struct {
	ID        int       `json:"id"`
	ChannelID int       `json:"channel_id"`
	UserID    int       `json:"user_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	User      *User     `json:"user,omitempty"`
}

type CreateChannelRequest struct {
	Name        string `json:"name"`
	Handle      string `json:"handle"`
	Description string `json:"description"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	BannerURL   string `json:"banner_url,omitempty"`
}

type UpdateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	BannerURL   string `json:"banner_url,omitempty"`
}

type ChannelConversation struct {
	Channel     Channel  `json:"channel"`
	Subscriber  User     `json:"subscriber"`
	User        *User    `json:"user,omitempty"`
	UserID      int      `json:"user_id"`
	LastMessage *Message `json:"last_message,omitempty"`
	LastText    string   `json:"last_text,omitempty"`
	UnreadCount int      `json:"unread_count"`
	IsCreator   bool     `json:"is_creator"`
}

// ==========================================
// POLLS & VOTING (ОПРОСЫ И ГОЛОСОВАНИЯ)
// ==========================================
type PollOption struct {
	ID         int     `json:"id"`
	PollID     int     `json:"poll_id"`
	Text       string  `json:"text"`
	VotesCount int     `json:"votes_count"`
	Percentage float64 `json:"percentage"`
	IsVoted    bool    `json:"is_voted"`
}

type Poll struct {
	ID                 int          `json:"id"`
	CreatorID          int          `json:"creator_id"`
	Question           string       `json:"question"`
	IsMultiple         bool         `json:"is_multiple"`
	IsAnonymous        bool         `json:"is_anonymous"`
	TotalVotes         int          `json:"total_votes"`
	Options            []PollOption `json:"options"`
	UserVotedOptionIDs []int        `json:"user_voted_option_ids,omitempty"`
	HasVoted           bool         `json:"has_voted"`
	CreatedAt          time.Time    `json:"created_at"`
	Creator            *User        `json:"creator,omitempty"`
}

type CreatePollRequest struct {
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	IsMultiple  bool     `json:"is_multiple"`
	IsAnonymous bool     `json:"is_anonymous"`
}

type UpdatePollRequest struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type VotePollRequest struct {
	PollID   int `json:"poll_id"`
	OptionID int `json:"option_id"`
}

// ==========================================
// ACHIEVEMENTS & GAMIFICATION MODELS
// ==========================================

type Achievement struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Category    string     `json:"category"`
	Rarity      string     `json:"rarity"` // common, rare, legendary
	Icon        string     `json:"icon"`
	Points      int        `json:"points"`
	TargetCount int        `json:"target_count"`
	SortOrder   int        `json:"sort_order"`
	Progress    int        `json:"progress"`
	IsUnlocked  bool       `json:"is_unlocked"`
	UnlockedAt  *time.Time `json:"unlocked_at,omitempty"`
}

type UserAchievementsResponse struct {
	UserLevel           LevelInfo     `json:"user_level"`
	TotalAchievements   int           `json:"total_achievements"`
	UnlockedCount       int           `json:"unlocked_count"`
	TotalPointsEarned   int           `json:"total_points_earned"`
	TotalPointsPossible int           `json:"total_points_possible"`
	Achievements        []Achievement `json:"achievements"`
	NewUnlocked         []Achievement `json:"new_unlocked,omitempty"`
}

type LevelInfo struct {
	Level        int    `json:"level"`
	Title        string `json:"title"`
	CurrentXP    int    `json:"current_xp"`
	NextLevelXP  int    `json:"next_level_xp"`
	PrevLevelXP  int    `json:"prev_level_xp"`
	ProgressPerc int    `json:"progress_perc"`
	TotalXP      int    `json:"total_xp"`
}

var LevelTiers = []struct {
	Level int
	XP    int
	Title string
}{
	{1, 0, "Новичок"},
	{2, 50, "Стрит-кид"},
	{3, 120, "Фиксер"},
	{4, 220, "Соло"},
	{5, 350, "Техник"},
	{6, 500, "Нетраннер"},
	{7, 700, "Кибер-самурай"},
	{8, 950, "Хром-мастер"},
	{9, 1250, "Арасака Оверлорд"},
	{10, 1600, "Легенда Найт-Сити"},
}

func CalculateLevel(totalXP int) LevelInfo {
	if totalXP < 0 {
		totalXP = 0
	}

	currTierIdx := 0
	for i := len(LevelTiers) - 1; i >= 0; i-- {
		if totalXP >= LevelTiers[i].XP {
			currTierIdx = i
			break
		}
	}

	currTier := LevelTiers[currTierIdx]
	var nextTierXP int
	if currTierIdx < len(LevelTiers)-1 {
		nextTierXP = LevelTiers[currTierIdx+1].XP
	} else {
		nextTierXP = currTier.XP + 500
	}

	prevTierXP := currTier.XP
	xpInCurrentLevel := totalXP - prevTierXP
	xpNeededForNext := nextTierXP - prevTierXP
	perc := 0
	if xpNeededForNext > 0 {
		perc = (xpInCurrentLevel * 100) / xpNeededForNext
		if perc > 100 {
			perc = 100
		}
	} else {
		perc = 100
	}

	return LevelInfo{
		Level:        currTier.Level,
		Title:        currTier.Title,
		CurrentXP:    xpInCurrentLevel,
		NextLevelXP:  xpNeededForNext,
		PrevLevelXP:  prevTierXP,
		ProgressPerc: perc,
		TotalXP:      totalXP,
	}
}
